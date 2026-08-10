---
# accord-g5lm
title: Implement 9 simple cranks (non-draw)
status: completed
type: task
created_at: 2026-08-09T20:15:13Z
updated_at: 2026-08-09T20:15:13Z
parent: accord-t5rx
---

One file per crank in src/cranks/:

- request-vrf.ts: Created without committedVrf → requestVrf()
- finalize-round.ts: past revealEnd → finalizeRound()
- finalize-dispute.ts: past appealWindow → finalizeDispute()
- settle-round.ts: Final, prior round unsettled → settleRound()
- cancel-dispute.ts: past timeout → cancelDispute()
- redraw.ts: RedrawEligible → redraw()
- execute-update.ts: slot >= executeAfterSlot → executeSubaccordUpdate()
- execute-unpause.ts: slot >= pendingUnpauseAfter → executeUnpause()
- claim-refund.ts: Final/Failed, bond outstanding → claimAppealRefund()

Each: read dispute state via SDK decoder, build instruction via SDK builder,
send via sendIx with retry. Register in dispatch map (src/dispatch.ts).
All use @useaccord/sdk — no raw instruction encoding.

## Summary of Changes

Implemented the nine non-draw permissionless cranks as a new pnpm workspace
package `@useaccord/cranker` (`apps/cranker/`).

**Files added:**

- `apps/cranker/package.json`, `tsconfig.json`, `eslint.config.js` — minimal
  package shell (mirrors `apps/evidence-daemon`) needed to typecheck/lint.
  The wallet loader, `.env.example`, reconciler loop, and WS listener remain
  in the scope of bean accord-7d4c; this shell only adds what the cranks need
  to verify.
- `src/types.ts` — the crank contract: `CrankAction` (discriminated union,
  discriminator-only payloads), `CrankContext` (facade + signer + `sendIx` +
  VRF oracle config + log), `CrankResult`, `ActionOf<K>` helper. This is the
  seam the state resolver (bean accord-rnel) emits into.
- `src/util.ts` — Kit-only shared helpers: `ataOf` (ATA derivation, no
  `@solana/spl-token` — same reason as the e2e setup), typed `fetchDispute`/
  `Round`/`Subaccord`/`AppealBond`/`PauseState`, address-only PDA wrappers
  (`roundPda`, `appealBondPda`, `pauseStatePda`, `panelStakePdas`), and
  `findPendingUpdateForSubaccord` (nonce-scan over the SDK's typed fetcher;
  drops raw getProgramAccounts/discriminator plumbing).
- `src/cranks/*.ts` — one file per crank. Each reads dispute state via SDK
  decoders, resolves the accounts the SDK builder needs (panel JurorStake
  PDAs, token ATAs, AppealBond PDAs), builds the instruction via the SDK
  builder (`requestVrf`/`finalizeRound`/`finalizeDispute`/`settleRound`/
  `cancelDispute`/`redraw`/`executeSubaccordUpdate`/`executeUnpause`/
  `claimAppealRefund`), and sends via `ctx.sendIx`. No raw instruction
  encoding anywhere.
- `src/dispatch.ts` — `CRANK_DISPATCH` map (kind → executor) +
  `dispatchCrank(ctx, action)` router.
- `src/dispatch.test.ts` — self-check: every `CrankKind` has a registered
  executor + exactly the nine non-draw cranks (catches "wrote it, forgot to
  register it").

**Design notes:**

- The resolver (accord-rnel) is authoritative on timing/state; each crank
  adds only a light defensive guard (skip if obviously wrong state, e.g.
  `finalize_round` on a `Final` dispute). Simulation failures are NOT
  retried — another cranker or the user may have advanced the state.
- `settle_round.roundIdx` and `claim_refund.roundIdx` are the only
  non-`kind` payload discriminators (the resolver picks WHICH prior round /
  appeal); everything else the executor derives from on-chain state.
- `draw_seat` is intentionally absent — separate bean (accord-7sky) owns it
  (needs the MST tree cache + per-seat Merkle proofs).

**Verification:**

- `pnpm --filter @useaccord/cranker build` (tsc --noEmit) — clean.
- `pnpm --filter @useaccord/cranker lint` (eslint) — clean.
- `pnpm --filter @useaccord/cranker test` (bun test) — 2/2 pass.
- `pnpm -r run lint` — full workspace clean.
