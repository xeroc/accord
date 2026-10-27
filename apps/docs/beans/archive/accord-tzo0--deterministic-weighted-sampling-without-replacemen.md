---
# accord-tzo0
title: Deterministic weighted sampling without replacement — drop draw_attempt grind (CONCEPT-REVIEW Ugly 1 + 7)
status: completed
type: task
priority: critical
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-06T06:30:00Z
parent: accord-ukqg
blocked_by:
  - accord-9hh7
  - accord-g74z
---

## Why

`draw` (`lib.rs:861-904`) mixes a **caller-supplied** `draw_attempt` into the VRF
seed (`lib.rs:895-904`); each attempt yields a different `r_i` per slot
(`lib.rs:926-935`). ADR-0009 claims the caller has "zero influence" over the panel,
but nothing forces attempt 0 or sequential use. The cranker can compute all
collision-free attempts off-chain and submit whichever panel it prefers — turning
one unbiased VRF output into a menu of juries. A filer/briber/whale can search for
a friendly panel. This defeats random selection even though the narrower
VRF-replacement bug (veridao-utcu) is closed.

Compounding it (Ugly 7): the collision-retry design draws each seat independently
(stake-weighted) then rejects duplicate-filled panels. The collision table in
ADR-0009 uses **pool size**, but the decisive variable under concentrated stake is
the stake distribution — a whale is drawn repeatedly, collisions are common, and
retries may not converge. Worse, a whale _benefits_ from collision-searching for
its own keys (Ugly 1 + Ugly 7 interact badly). CONCEPT-REVIEW §Ugly 1, §Ugly 7.

## How (agreed)

1. Remove `draw_attempt` from the `draw` instruction entirely.
2. Seed = `hash(committed_vrf ‖ dispute ‖ round)` — no attempt component.
3. Per seat `i`, the **chain** deterministically computes
   `r_i = hash(seed ‖ i ‖ retries_i) mod total_stake`, incrementing `retries_i`
   on-chain until the leaf containing `r_i` is not an already-selected juror. The
   cranker only submits the memberships that match this deterministic computation.
4. The MST stays fixed; rejection happens on the `r_i` value (sampling with
   replacement from the MST, rejecting already-selected) = weighted sampling
   without replacement, deterministic. One seed → exactly one panel. No caller
   knob, no grinding, always terminates if ≥ N eligible jurors exist.
5. Keep the oracle-verified VRF (request_vrf / commit_vrf_callback, veridao-crbf).
6. Update SDK `vrf.ts` choreography: remove the attempt-retry loop; on
   SortitionMismatch the submission was simply wrong (no retry).

## TDD acceptance

- Given a committed VRF + finalized snapshot, exactly one valid panel exists; the
  chain accepts only it.
- Submitting a different panel → `SortitionMismatch`.
- Collision case (r_i lands on an already-drawn juror) deterministically re-rolls
  and resolves WITHOUT failing the tx and WITHOUT caller choice.
- Concentrated-stake fixture (one whale, small honest pool) still yields a valid
  distinct panel (liveness).
- No `draw_attempt` argument remains in the IDL/SDK.

## References

CONCEPT-REVIEW §Ugly 1, §Ugly 7; ADR-0009 §2; `lib.rs:861-944`; beans veridao-4nyi,
veridao-crbf. Requires a superseding ADR. Blocked by the MST-sum task (shared
draw/MST code path — do MST first to avoid rework).

## Update (2026-08-05) — operates on the accumulator root

With ADR-0012 (bean accord-g74z), there is no posted snapshot. draw reads the frozen accumulator root copied onto the Dispute at filing. The deterministic sampling (no draw_attempt; on-chain deterministic collision re-roll) is unchanged in logic but now verifies each seat's membership against the canonical subtree-sum root. Additionally, draw MUST become per-seat (`draw_seat(i)`): the 1232-byte tx packet cannot hold N Merkle proofs (each ≈ 44 + 40·depth bytes). One seat per tx; resumable; deterministic so only one valid submission exists per seat. This per-seat split is a pre-existing Solana tx-size constraint (the old one-shot draw already cannot fit 31 proofs), not a new cost of the accumulator. Blocked-by the accumulator bean.

## Refinement (2026-08-05) — root frozen at VRF-commit

draw_seat reads dispute.frozen_root (set in commit_vrf_callback, NOT at filing). All N seats select against this single frozen root (coherence + manipulation resistance — see ADR-0012 §5). Sampling/deterministic re-roll logic unchanged; just anchored on frozen_root instead of a snapshot root.

## Summary of Changes

### On-chain (programs/accord/src/)

**state.rs** — Added `seat_prefix: [u64; MAX_JURORS]` and `seat_stake: [u64; MAX_JURORS]` to the zero-copy `Round` struct. These store each drawn seat's sortition range `[prefix, prefix+stake)` and are written when a seat lands; later seats read them to verify that every prior sortition retry genuinely collided with an already-drawn juror. This is the mechanism that eliminates caller choice — the chain independently confirms the cranker's collision-re-roll count.

**constants.rs** — Added `MAX_SORTITION_RETRIES: u32 = 1024` (generous bound; the common case is 0 retries).

**errors.rs** — Added `MaxRetriesExceeded` (error code 6046).

**lib.rs** — Rewrote `draw_seat`:

- Added `retries: u32` instruction argument.
- Sortition hash now includes the retry counter: `r_i = u64_le(sha256(vrf_seed ‖ seat ‖ retry)[..8]) % frozen_total_stake`.
- For each retry `0..retries`: verifies `r_i(retry)` falls inside an already-drawn seat's stored range (genuine collision — the cranker cannot skip a non-colliding retry to cherry-pick a juror).
- For the terminal retry (`== retries`): verifies `r_i` selects the submitted leaf.
- Stores the drawn seat's `(prefix, stake)` into `round.seat_prefix`/`round.seat_stake` for future collision checks.
- Updated the inline `sortition_prefix_brackets_vrf_seat` unit test for the new hash format.

### LiteSVM tests (programs/accord/tests/accumulator_litesvm.rs)

- Updated `draw_seat_fills_round_against_frozen_root` for the new hash (retry byte) + `retries: 0` arg.
- Added `draw_seat_collision_re_roll_resolves_without_caller_choice`: a concentrated-stake fixture (75% whale) where seat 1 collides with the whale at retry 0 and re-rolls to a distinct juror at retry 1. Also verifies that a fabricated `retries=1` (when retry 0 did NOT collide) is REJECTED — proving no caller choice.
- Added `submit_draw_seat` helper for reuse across tests.

### SDK (packages/sdk/src/)

- **generated/instructions/drawSeat.ts** — Added `retries: number` field.
- **generated/accounts/round.ts** — Added `seatPrefix` / `seatStake` arrays (31 × u64 each) + updated size to 2600.
- **generated/errors/accord.ts** + **errors.ts** — Added `MaxRetriesExceeded`.
- **methods/vrf.ts** — `seatSlot` now takes a `retry` param (default 0). Added `resolveSeat()` — the client-side deterministic collision re-roll loop that returns `{ leaf, index, proof, retries }`. `SeatMembership` gained a `retries` field. `drawSeat()` threads it to the chain.
- **adapter.ts** — `buildDrawSeat` passes `retries`.
- **vrf.test.ts** — Updated for the new `seatSlot` signature.

### e2e (tests/src/)

- **draw-harness.ts** — Full rewrite for the accumulator + draw_seat flow: staking with accumulator paths, VRF injection with root freeze, `resolveSeat`-based panel resolution, per-seat `drawSeat` submission. Removed all snapshot-era code.
- **draw.spec.ts** — Rewritten for accumulator + draw_seat.
- **full-lifecycle.spec.ts** — Updated for the new harness API (`resolveDistinctPanel` returns `SeatMembership[]` directly; `submitDraw` takes memberships directly).

### Verification

- LiteSVM: 23/23 tests pass (including the new collision re-roll + fabrication-rejection test).
- SDK: 42/42 tests pass, lint clean.
- TypeScript: draw-harness.ts, draw.spec.ts, full-lifecycle.spec.ts compile with zero errors.
