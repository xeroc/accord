---
# accord-e539
title: draw_seat crank — per-seat tx with Merkle proof
status: completed
type: task
priority: normal
created_at: 2026-08-09T20:15:23Z
updated_at: 2026-08-09T22:08:52Z
parent: accord-7sky
blocked_by:
  - accord-gpo7
---

src/cranks/draw-seat.ts:

1. Get tree cache for the disputes Subaccord (from tree-cache task)
2. Read dispute.committedVrf + frozenRoot + frozenTotalStake
3. Compute vrf_seed = sha256(vrf ‖ dispute ‖ roundIdx ‖ drawAttempt)
4. For each seat (0..panel-1 not yet drawn):
   a. Compute r_i(retry) = u64_le(sha256(vrf_seed ‖ seat ‖ retry)) % totalStake
   b. Binary-search prefix ranges to find target juror
   c. Handle collisions (retry increments when r_i hits already-drawn juror)
   d. Build Merkle proof via SDK proofFor
   e. Build drawSeat instruction via SDK
   f. Send one tx per seat (1232-byte limit)
5. Register in dispatch map

## Summary of Changes

- `apps/cranker/src/cranks/draw-seat.ts` — the draw_seat crank handler +
  `resolvePanel` pure helper.
  - `drawSeatHandler`: verifies the frozen root via `TreeCache` (skip on
    mismatch), resolves each remaining seat via SDK `resolveSeat` (sortition +
    collision re-roll + Merkle proof), builds the `drawSeat` instruction via the
    SDK adapter, and sends one tx per seat. On `SimulationError` (state moved),
    stops the seat loop — the next cycle retries from the on-chain seat count.
    On frozen-root mismatch or zero total stake, returns early (skip draw).
  - `resolvePanel`: pure function resolving a contiguous seat range against the
    frozen accumulator with growing already-drawn tracking. Tested independently
    of the chain.
  - `registerDrawSeatCrank(dispatch)`: registers the handler on the dispatch
    map. Module-level singletons for `TreeCache` + `Accord` facade (lazily
    created from `ctx.rpc` + `ctx.wallet.signer`).
- `apps/cranker/src/cranks/draw-seat.test.ts` — 4 unit tests for
  `resolvePanel`: full 3-seat panel from 3 stakers (all distinct + from pool),
  fromSeat offset with 1 already drawn, heavy stake imbalance (collision
  re-roll produces distinct seats), fromSeat == panelSize (no-op).

### Verification

- `tsc --noEmit` — clean
- `eslint src/cranks/*.ts` — clean
- `bun test src/cranks/draw-seat.test.ts` — 4 pass / 0 fail
- Full cranker suite: 36 pass / 0 fail (no regressions)
