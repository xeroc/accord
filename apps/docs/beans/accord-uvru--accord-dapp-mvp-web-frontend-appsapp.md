---
# accord-uvru
title: Accord dApp MVP — web frontend (apps/app)
status: todo
type: milestone
priority: high
created_at: 2026-08-07T23:07:56Z
updated_at: 2026-08-07T23:07:56Z
---

## Accord dApp MVP — React + Vite web frontend

> **Status:** grilling complete (2026-08-08). Ready for implementation.
> A separate agent will take on implementation.

## What

A static-built React + Vite dApp (`apps/app`) that lets users interact with the
Accord program via the `@useaccord/sdk` + ConnectorKit wallet connection. Hosted
on GitHub Pages (HashRouter — no server routing).

## Three happy paths

| Path                       | Scope                                                                          |
| -------------------------- | ------------------------------------------------------------------------------ |
| **(a) Create Subaccord**   | Form with 13 params → `createSubaccord` instruction                            |
| **(b) Juror activities**   | Stake/unstake (MST accumulator), commit/reveal voting inline on dispute detail |
| **(c) Dispute activities** | Create dispute (raw option hashes), appeal, get ruling                         |

**Daemon handles:** request_vrf, draw_seat, finalize_*, settle_round (mechanical cranks).
**Excluded from MVP:** evidence, e2e tests for web app, subaccord governance updates, pause/unpause.

## Architecture decisions (grilling 2026-08-08)

1. **App boundary:** `apps/app` — separate from Astro landing page.
2. **Wallet:** ConnectorKit (`@solana/connector`) — Wallet Standard, `useKitTransactionSigner()`, `useCluster()`. No custom wallet adapter.
3. **Read model:** `getProgramAccounts` (private rate-limited RPC) + address-first deep links. No indexer.
4. **Components:** shadcn (Radix + Tailwind v4). Brand palette → CSS variables.
5. **Routing:** HashRouter. Routes: `/`, `/subaccords`, `/subaccords/:address`, `/subaccords/new`, `/juror`, `/juror/stake`, `/disputes`, `/disputes/:address`, `/disputes/new`. Voting inline on dispute detail.
6. **Cluster config:** Devnet default. RPC URLs via `VITE_DEVNET_RPC` / `VITE_MAINNET_RPC`. Localnet option.
7. **Option labels:** Raw 32-byte hashes only. No label mapping. Deferred to evidence backend.
8. **Data layer:** TanStack Query. Plain controlled inputs for forms (no zod, no react-hook-form).
9. **SDK prerequisite:** Typed fetch + typed getProgramAccounts wrappers. Frontend is typed only — no raw bytes.

## Structure

```
apps/app/src/
  features/
    subaccord/    ← (a) create, list, detail
    juror/        ← (b) stake, positions, voting
    dispute/      ← (c) create, list, detail, appeal
  shared/         ← rpc.ts, transaction.ts, tokens.ts, format.ts, cluster.ts
  components/     ← shadcn primitives
  routes.tsx, App.tsx, main.tsx
```

## Brand constraints (from brand/DESIGN.md + BRAND.md)

- Dark-first: ink `#0A0E14`, raised `#11161D`, border `#1F2630`
- Verdict Amber `#F0A830` (primary CTA, active states)
- Confirm Green `#3FB950` / Slash Red `#F85149` (state only)
- IBM Plex Sans (body/headlines) + IBM Plex Mono (code/labels/stats) via `@fontsource`
- No photos, no emoji, no gradients, no glassmorphism
- Sentence case + period on headlines

## HANDOFF

### 1. Happy Path

**Create Subaccord:** user connects wallet → `/subaccords/new` → fills 13-field form (staking token address, min stake, alpha bps, windows, max appeals, authority, evidence operator, risk type hash, evidence spec hash, depth) → app builds `createSubaccord` instruction via SDK → signs via ConnectorKit → sends via Kit `sendAndConfirmTransactionFactory` → redirect to `/subaccords/:address`.

**Stake:** juror connects wallet → `/juror/stake` → selects subaccord → app fetches all JurorStakes via `findJurorStakesBySubaccord(rpc, subaccord)` → builds MST accumulator → computes Merkle proof → builds `stake` instruction → signs + sends.

**Create Dispute:** filer → `/disputes/new` → selects subaccord → pastes 2-N option hashes (32 bytes each) → nonce → app computes fee (`INITIAL_NUM_JURORS * feePerJuror`) → builds `createDispute` instruction → optionally bundles `requestVrf` → signs + sends.

**Vote (commit/reveal):** juror visits `/disputes/:address` → app checks if juror pubkey is in Round.jurors[] → renders commit form (vote option index + auto-generated salt) → `commit` instruction → after commit window, reveal form → `reveal` instruction.

**Appeal:** on `/disputes/:address` when `state == RoundResolved` and within appeal window → appeal button → `appeal` instruction (needs appeal bond).

**Get Ruling:** on `/disputes/:address` → reads `finalRuling` field (u8::MAX = not finalized) → displays verdict.

### 2. Data Contract

- SDK surface: `Accord` facade (`accord.methods.*`), PDA helpers (`findSubaccordPda`, `findDisputePda`, `findJurorStakePda`, `findRoundPda`), constants, MST accumulator (`buildAccumulator`, `proofFor`), decoders.
- ConnectorKit: `useKitTransactionSigner()` → `{ signer, ready }`, `useCluster()` → `{ cluster, rpcUrl, setCluster }`, `AppProvider` + `getDefaultConfig({ clusters })`.
- **SDK gaps to fix (prerequisite):**
  - Export typed fetch functions that work with raw Kit RPC (generated `fetchSubaccord(rpc, address)` etc.)
  - Add typed `getProgramAccounts` wrappers: `findAllSubaccords(rpc)`, `findJurorStakesBySubaccord(rpc, subaccord)`, `findDisputesBySubaccord(rpc, subaccord)`, `findJurorStakesByJuror(rpc, juror)`, `findDisputesByFiler(rpc, filer)`
- Frontend is TYPED ONLY. No raw bytes, no manual decoding, no memcmp offset construction.

### 3. Edge Cases & Constraints

- Frontend must never construct memcmp filters or decode raw account bytes — all via SDK typed functions.
- HashRouter (not BrowserRouter) — GitHub Pages static hosting.
- Vite env vars must be prefixed `VITE_`.
- MST accumulator for staking: fetch all JurorStakes → sort by `treeIndex` → `buildAccumulator(leafClaims)` → verify root matches `subaccord.rootHash` → `proofFor(accumulator, index)` where index = `nextIndex` (new staker) or `jurorStake.treeIndex` (existing).
- Commit hash = `sha256(vote_byte || salt[32] || juror_pubkey[32])` — computed by SDK `commit()` method.
- `requestVrf` CPIs magicblock VRF oracle — may not be available on devnet. Daemon handles it. UI optionally bundles it in create_dispute tx.
- Dispute options are raw `[u8;32]` hashes — display as hex in Plex Mono.

### 4. Business Logic (pseudo-code, target language)

```typescript
// useAccord() hook — recreates facade on wallet/cluster change
function useAccord() {
  const { signer } = useKitTransactionSigner();
  const { rpcUrl } = useCluster();
  return useMemo(
    () => (signer ? new Accord({ endpoint: rpcUrl, signer }) : null),
    [signer, rpcUrl],
  );
}

// sendInstruction() — shared tx helper
async function sendInstruction(rpc, signer, instruction) {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const tx = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayer(signer.address, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstruction(instruction, tx),
  );
  const signed = await signTransactionMessageWithSigners(tx);
  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signed, {
    commitment: "confirmed",
  });
  return getSignatureFromTransaction(signed);
}
```

### 5. Definition of Done

- [ ] SDK exports typed fetch + query wrappers (no raw bytes on frontend)
- [ ] Vite app scaffolded with Tailwind v4 + shadcn + ConnectorKit + HashRouter
- [ ] Brand palette mapped to shadcn CSS variables (ink/amber/GitHub-dark ramp)
- [ ] All three happy paths functional: create subaccord, stake/unstake, create dispute, vote, appeal, get ruling
- [ ] Cluster selector + wallet connect in navbar
- [ ] Static build passes (`pnpm --filter app build`)
- [ ] Manual testing against devnet/localnet successful

### 6. Test Matrix (Given / When / Then)

- Given wallet connected + devnet cluster, When user creates subaccord, Then subaccord account appears at derived PDA
- Given subaccord exists with stakers, When juror opens stake form, Then MST accumulator builds + proof computed + stake tx succeeds
- Given dispute in Created state, When filer creates dispute, Then dispute PDA initialized with option hashes + fee transferred
- Given juror drawn into dispute (via daemon draw_seat), When juror visits dispute detail, Then commit/reveal UI renders
- Given dispute in RoundResolved state, When user clicks appeal, Then appeal bond posted + new round initiated

### 7. Open Questions

- Exact private RPC URLs — fill via `.env` at implementation time
- Whether to bundle `requestVrf` into `createDispute` tx or leave to daemon — implementation decision
- shadcn preset code for brand theme — TBD (may use `--defaults` then customize CSS variables)
