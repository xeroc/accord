---
# accord-he1u
title: "SDK: threshold/shortfall/max_draw_attempts config + redraw instruction"
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T22:35:00Z
parent: accord-z8jp
blocked_by:
  - accord-5yh0
---

assigned: implementer. Expose kit fields in createSubaccord; redraw() facade; threshold on CaseTerms/Subaccord types.

## Summary of Changes

SDK surface for ADR-0021: expose the reveal-quorum config on `createSubaccord`,
add a `redraw()` facade, and thread `draw_attempt` through the sortition seed.

### Generated client (regenerated via `codama run js` from the ADR-0021 IDL)

- New `redraw` instruction + `ShortfallPolicy` type; `revealThresholdBps` /
  `shortfallPolicy` / `maxDrawAttempts` on `Subaccord` / `CaseTerms` /
  `createSubaccord`; `drawAttempt` on `Round`; `RedrawEligible` on `DisputeState`;
  new errors (`NotRedrawEligible`, `MaxDrawAttemptsLimitExceeded`, `InvalidThreshold`).

### Hand-written SDK (`packages/sdk/src`)

- `constants.ts`: +`DEFAULT_REVEAL_THRESHOLD_BPS` (6_666), +`MAX_DRAW_ATTEMPTS`
  (10), +`DEFAULT_MAX_DRAW_ATTEMPTS` (3).
- `types.ts`: re-export `ShortfallPolicy` (+ codec).
- `methods/lifecycle.ts`:
  - `CreateSubaccordArgs` +`revealThresholdBps`, +`shortfallPolicy`, +`maxDrawAttempts`.
  - +`assertValidRevealThreshold` (0..=10_000 bps), +`assertValidMaxDrawAttempts`
    (1..=`MAX_DRAW_ATTEMPTS`); both wired into `createSubaccord`.
- `methods/voting.ts`: +`RedrawAccounts` interface + `redraw()` facade +
  `buildRedraw` seam method (mirrors `finalizeDispute`; Fail branch carries the
  filer refund accounts).
- `methods/vrf.ts`: `draw_attempt` threaded through `vrfSeed` / `seatSlot` /
  `resolveSeat` (optional, default 0 — backward compatible; matches the on-chain
  seed `hash(vrf ‖ dispute ‖ round_idx ‖ draw_attempt)`).
- `methods/vrf.test.ts`: vrfSeed test now asserts `draw_attempt` binds the seed
  (redraw re-seeds) + the `InvalidDrawAttempt` guard.
- `adapter.ts`: `mapCreateSubaccordArgs` passes the 3 new fields; `buildRedraw`
  maps `RedrawAccounts` → `getRedrawInstruction` (+ remaining accounts).

### e2e fixture (`tests/src/setup/fixtures.ts`)

- `defaultSubaccordArgs` + the 3 new defaults (so the e2e mirror compiles
  against the new `CreateSubaccordArgs`).

### Verification

- `pnpm --filter @accord/sdk run build` (tsc): clean.
- `make lint`: clean.
- SDK vrf tests: **5/5 pass** (incl. the new `draw_attempt` seed-binding test).

### Notes

- The e2e specs (`tests/src/e2e.test.ts`, `appeal.spec.ts`) still construct a
  pre-E1 `CreateSubaccordArgs` (missing `feeToken`) and are stale from E1; they
  are sibling **accord-rcem**'s Surfpool-e2e rewrite scope, not this bean.
- `staking.test.ts` has 2 pre-existing failures (`stake.amount`, the pre-E1
  field name) — E1 test debt, untouched here.
