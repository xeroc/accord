---
# accord-rnel
title: State resolver — dispute state to next crank action
status: completed
type: task
priority: normal
created_at: 2026-08-09T20:14:41Z
updated_at: 2026-08-09T20:14:54Z
parent: accord-rev4
blocked_by:
  - accord-7d4c
---

src/state.ts: pure function `resolveNextAction(dispute, round, now) => CrankAction | null`.
Covers all 10 crank actions (see milestone HANDOFF §1 table).
Reads decoded Dispute + Round accounts from SDK decoders.
Returns null when waiting for a time window or user action.
No side effects — pure logic, unit-testable.

## Summary of Changes

Added `apps/cranker/src/state.ts` — `resolveNextAction(dispute, round, now)`, a pure
mapping from a decoded (Dispute, Round, now) snapshot to the next permissionless
crank action (or null while waiting). Gates mirror the on-chain instructions in
`programs/accord/src/lib.rs` exactly; `now` is a Unix-seconds timestamp.

- `CrankAction` discriminated union: `request_vrf`, `draw_seat{seat}`,
  `finalize_round`, `finalize_dispute`, `settle_round{roundIdx}`,
  `cancel_dispute`, `redraw`.
- Created → pre-draw `cancel_dispute` past `filedAt + PRE_DRAW_CANCEL_TIMEOUT_SECS`
  (3d); else `request_vrf` when `committedVrf` is None; else `draw_seat` for the
  next sequential seat (`round.jurorCount`, or 0 when the Round account is null)
  until `panelSizeForRound(currentRound)` fills.
- Drawn/Commit/Reveal → `finalize_round` at `now >= revealEnd`; `cancel_dispute`
  only after `revealEnd + appealWindow + POST_DRAW_CANCEL_GRACE_SECS` (3d grace
  — finalize gets its window first).
- RoundResolved → `finalize_dispute` once the appeal window closes; `cancel_dispute`
  after the grace expires.
- RedrawEligible → `redraw` immediately (reveal shortfall).
- Final → `settle_round{roundIdx}` for any prior unsettled round
  (`roundIdx < currentRound && settled == 0`); the final round is settled by
  `finalize_dispute` itself.
- Closed/Failed → null.

Scope note on "all 10 cranks": the signature `(dispute, round, now)` can only
resolve the 7 dispute-lifecycle cranks above. The slot-based timelock cranks
(`execute_subaccord_update`, `execute_unpause`) and `claim_appeal_refund` read
different account families (PendingUpdate / PauseState / AppealBond) on a slot
clock — they belong in separate resolvers over their own inputs and are left for
a follow-up. `Review` is in the enum but no instruction assigns it (unreachable).

Tests: `src/state.test.ts` — 15 cases, every state branch + the reveal_end /
appeal_window / cancel-grace boundaries. `bun test` → 15 pass.
Verify: `pnpm run build` (tsc --noEmit) ✓, `pnpm run lint` ✓, `pnpm test` ✓.
