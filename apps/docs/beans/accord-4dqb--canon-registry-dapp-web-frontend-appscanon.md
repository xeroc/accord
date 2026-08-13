---
# accord-4dqb
title: Canon Registry dApp — web frontend (apps/canon)
status: todo
type: milestone
priority: normal
created_at: 2026-08-13T02:08:00Z
updated_at: 2026-08-13T02:08:00Z
---

## Canon Registry dApp — React + Vite web frontend (apps/canon)

> **Status:** grilling complete (2026-08-13). Ready for fleet dispatch.
> A separate agent takes each task. This HANDOFF is inherited verbatim by every
> descendant — do NOT copy it into epic/task bodies; reference `see milestone §N`.

## What

A static-built React + Vite dApp at **`apps/canon`** (`@useaccord/canon-app`)
that lets users interact with the **Canon** curated-list program
(`programs/canon`) via the `@useaccord/canon` SDK + ConnectorKit wallet
connection. Canon is an Arbitrable over Accord: it owns the item lifecycle +
deposits; Accord owns juror staking, the VRF draw, commit-reveal voting, and the
ruling. The app mirrors `apps/app` (the Accord dApp) stack-for-stack.

## Four happy paths

| Path | Scope |
| --- | --- |
| **(a) List Creator** | `create_list` form (mints, list_program, rules_hash, econ params) → backing Subaccord CPI |
| **(b) Item Submitter** | `submit_item` (account + evidence + deposit); `request_withdrawal` |
| **(c) Challenger** | `challenge_item` — full evidence manifest via the shared evidence module + daemon publish |
| **(d) Watcher** | Browse lists (`getProgramAccounts`), browse items per list (memcmp on `list`), item detail with state machine + dispute cross-link |

**Cranks (advance_pending, settle_item, advance_withdrawal) are NOT in the app**
— owned by the cranker (parked DRAFT bean: refactor `apps/cranker` to drive canon
cranks). The app shows item state read-only; it does not crank.

## Architecture decisions (grilling 2026-08-13)

1. **App boundary:** separate `apps/canon` (`@useaccord/canon-app`), mirrors
   `apps/app` exactly. Own logo (registry-rows glyph), own GH Pages deploy.
2. **Stack:** Vite + React + Tailwind v4 + HashRouter + shadcn + ConnectorKit
   (`@solana/connector`). Reuses DESIGN.md tokens (ink/raised/amber/green/red,
   IBM Plex Sans/Mono), dark-only. Same tsconfig base.
3. **Scope:** full coverage — all 7 Canon instructions across 4 actors.
4. **Read model:** `getProgramAccounts` (private rate-limited RPC) + memcmp on
   the `list` field (CanonItem discriminator offset: 1-byte disc + 32-byte
   `account` + 32-byte `list` ⇒ memcmp at byte 33). Address-first deep links
   (`/lists/:address`, `/items/:address`). Client-side pagination (cap + "load
   more"). **No indexer, no backend.** Mirrors `apps/app`'s read pattern.
5. **Evidence:** full daemon integration like `apps/app` — the manifest builder,
   publisher (`claimantEncrypt` + POST), parser, and `useManifest` fetch are
   **extracted into `@useaccord/sdk/evidence`** (single source of truth; ADR-0015
   scope = the evidence wire contract). `apps/app` migrates to import from there.
6. **`description` field (NEW):** add a top-level `description` (markdown) field
   to `accord-evidence/v1` — builder + parser + `EVIDENCE-FORMAT.md`. For Canon
   this is the challenger's claim body. Rendered as **sanitized markdown**
   (`react-markdown` + `remark-gfm`, no raw HTML, links `target=_blank
   rel=noopener`). Committed manifest bytes are NEVER altered — rendering is
   display-only; jurors still verify `sha256(manifest)==evidence_hash` over raw
   bytes.
7. **Backing dispute:** inline read-only dispute-status card on item detail
   (decode accord `Dispute` PDA via `@useaccord/sdk` decoders, raw-RPC read like
   `apps/app`'s `fetchSubaccord`) + **deep link** to the accord app's
   `/disputes/:address` (new tab). Canon never reimplements voting.
8. **Cranks:** cranker-owned (not the app).
9. **Home:** generic list browser + reserved featured slot (no hardcoded list;
   no flagship deployed yet).
10. **Deploy:** GH Pages + HashRouter (mirrors `apps/app`).

## Dependencies (bean graph)

- **E1 (scaffold)** gates E2, E3, E4, E5, E6 (`--blocked-by E1`).
- **E2 (evidence extraction + description)** gates **E5** (`challenge + evidence`).
- E3, E4, E6 run in parallel once E1 merges.

## HANDOFF

### 1. Happy Path

1. Watcher opens `/` → list browser (`getProgramAccounts` on CanonList) → clicks
   a list → `/lists/:address` (items via memcmp on `list` field).
2. Submitter on a list → `submit_item` (account, evidence hash, deposit) → item
   `Pending`.
3. Challenger on an item → `challenge_item`: authors evidence manifest (title +
   **description** markdown + entries) via shared evidence module →
   `sha256(manifest)` = evidence_hash → `claimantEncrypt` + POST to evidence
   daemon → `challenge_item` instruction locks stake + fee, CPIs Accord
   `create_dispute`. Item → `Disputed`.
4. After Accord finalizes, the cranker's `settle_item` redistributes; the app
   reads the new state + (inline) the accord `Dispute.final_ruling`.
5. Submitter may `request_withdrawal` (Listed → WithdrawPending); cranker's
   `advance_withdrawal` returns stake after the timelock.

### 2. Data Contract

- **SDK:** `@useaccord/canon` — `findCanonListPda`, `findCanonItemPda`,
  `submitItem`, `challengeItem`, `requestWithdrawal`, `createList`,
  `fetchCanonList`, `fetchCanonItem` (all exist; `create_list` facade may need
  confirming against current SDK).
- **Evidence:** `@useaccord/sdk/evidence` — crypto (`claimantEncrypt`, `sha256`,
  `ed25519PublicKeyFromSeed`) + **extracted** `buildManifest`, `parseManifest`,
  `deriveOptionHashes`, `generateSalt`, `publishEvidence`, `verifyManifestHash`.
  New: manifest gains a `description` field (markdown, optional).
- **Accord read:** `@useaccord/sdk` decoders (`getDisputeDecoder` /
  `getSubaccordDecoder`) for the inline dispute-status card.
- **Account offsets (memcmp):** CanonItem = 8-byte Anchor discriminator, then
  `account: Pubkey` (32), then `list: Pubkey` (32) ⇒ filter `list` at **byte 40**
  (8 disc + 32 account). *(Confirm exact offset against the generated codec at
  implementation time — see Open Questions.)*
- **Routes:** `/`, `/lists`, `/lists/:address`, `/lists/new`, `/items/:address`.
- **Env:** `VITE_RPC_URL` (private rate-limited), `VITE_EVIDENCE_DAEMON_URL`,
  `VITE_ACCORD_APP_URL` (deep-link target).

### 3. Edge Cases & Constraints

- **No cranks in the app.** Do not wire advance_pending/settle_item/
  advance_withdrawal as user actions — they are cranker-owned.
- **Canon dispute options are FIXED** (`[keep, remove]`) — the challenger does
  NOT author option labels; the description field IS the claim.
- **Markdown render must not mutate committed bytes.** `sha256(manifest)` is over
  the raw YAML; rendering is a pure display transform.
- **`list_program` ownership check** is on-chain (`account.owner ==
  list.list_program`, unless sentinel). The app should validate/preview this
  client-side before submit where feasible.
- **`getProgramAccounts` rate limits** — use the private RPC; cap page size;
  degrade gracefully (empty state, not a crash).
- **DESIGN.md discipline is mandatory** — dark-only, ink/amber, Plex, monoline
  icons, no banned motifs. See `meta/brand/DESIGN.md` §10 (what to never ship).
- **Never hand-edit generated SDK code.** If the SDK lacks a needed facade, add
  it in `packages/canon/src/methods.ts` + regenerate.

### 4. Business Logic (target: TS, illustrative)

```
// item list for a list (memcmp on `list` field)
const items = await rpc.getProgramAccounts(CANON_PROGRAM_ID, {
  filters: [{ memcmp: { offset: 40, bytes: listAddress, encoding: "base58" } }],
  encoding: "base64",
}).send().then(decodeEachWith(getCanonItemDecoder()));

// challenge evidence (shared module, post-extraction)
const manifest = buildManifest({ salt, title, description, entries }, ctx);
const evidenceHash = await sha256(manifest);
await publishEvidence({ endpoint, subaccord, dispute, manifest, operatorPub });
// then challengeItem(...) — options are canon-fixed [keep,remove]
```

### 5. Definition of Done

- [ ] `apps/canon` scaffolds, lints clean, builds green (`pnpm --filter @useaccord/canon-app run build`).
- [ ] List browser + create-list + list-detail render live chain data.
- [ ] submit_item + request_withdrawal execute against a Surfpool/devnet list.
- [ ] challenge_item files a dispute; evidence manifest publishes to the daemon; description renders as markdown.
- [ ] Inline dispute-status card decodes the accord Dispute PDA; deep link opens the accord app.
- [ ] Evidence module extracted to `@useaccord/sdk/evidence`; `apps/app` migrated, its existing tests still pass.
- [ ] `description` field added to `accord-evidence/v1` (builder + parser + EVIDENCE-FORMAT.md).
- [ ] Whole workspace green: `make codegen && pnpm -r run build`.
- [ ] DESIGN.md compliance: dark-only, no banned motifs.

### 6. Test Matrix (Given / When / Then)

- Given a Surfpool list, When submitter calls submit_item, Then CanonItem is Pending with accumulated_stake == submit_deposit.
- Given a Pending item past listing_window, When watcher opens item detail, Then state shows "listable" (read-only; cranker advances).
- Given a Listed item, When challenger authors a manifest with description + submits challenge_item, Then item → Disputed, evidence_hash matches sha256(manifest), daemon stores the bundle.
- Given a Disputed item whose accord Dispute is final, When watcher opens detail, Then inline card shows the ruling + a deep link to the accord app.
- Given a WithdrawPending item, When submitter has waited the timelock, Then the app shows "withdrawable" (read-only; cranker settles).
- Given a manifest with markdown description, When rendered, Then formatting displays but raw bytes are unchanged (sha256 stable).

### 7. Open Questions

- **CanonItem memcmp offset for `list`:** confirm byte 40 (8 disc + 32 account)
  against the generated codec at E3 implementation time.
- **`create_list` facade:** confirm `@useaccord/canon` exports a usable
  `createList` (SDK README flagged it as not-yet-shipped — verify; add if
  missing). This is E3's first check.
- **Featured slot source:** how is the flagship list address configured for the
  featured slot? Env var (`VITE_FEATURED_LIST`) proposed; confirm at E6.
- **Logo checkmark geometry at 16px:** the registry-rows glyph's amber checkmark
  may blur at favicon size — confirm/simplify at E1.
