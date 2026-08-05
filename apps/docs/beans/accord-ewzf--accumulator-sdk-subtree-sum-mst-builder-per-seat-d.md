---
# accord-ewzf
title: "Accumulator — SDK: subtree-sum MST builder, per-seat draw_seat, drop snapshot methods (ADR-0012)"
status: todo
type: task
priority: high
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T22:34:00Z
parent: accord-g74z
blocked_by:
  - accord-g74z
---

## Why

`packages/sdk` currently implements the ADR-0009 cumulative-from-left MST
builder, the one-shot `draw` choreography, and the snapshot methods
(post/challenge/finalize). ADR-0012 replaces all three. Plus the two locked
decisions: `Dispute.frozen_root` (written by `commit_vrf_callback`; SDK reads
it), `JurorStake` drops `last_change_slot` + gains `tree_index`, `Subaccord`
gains the accumulator fields.

## Scope

- **MST builder → subtree-sum**: node = `H(left_hash ‖ left_sum ‖ right_hash ‖
right_sum)`; `LeafClaim` drops `cum_after` (prefix computed from the path);
  build/proof/verify must match on-chain `verify_mst_inclusion` exactly.
- **Incremental-update helper** (indexer side): produce the client-supplied
  Merkle path for a `stake`/`unstake` against the current root.
- **VRF flow**: `commit_vrf_callback` now also sets `frozen_root`; the SDK reads
  `dispute.frozen_root` for the draw (not a snapshot root).
- **draw choreography → per-seat `draw_seat(i)`**: replaces one-shot `draw`. On
  `SortitionMismatch` the submission was simply wrong — no retry (deterministic
  sampling). Deterministic collision re-roll computed client-side to match the
  chain. Shared with bean `accord-tzo0`.
- **Delete**: `post_snapshot`, `challenge_snapshot`, `finalize_snapshot` methods
  - types (`Snapshot`, `FraudProof`, `SnapshotStatus`, bond flows).
- **Types**: `Subaccord` +`root/total_stake/next_index/depth`; `JurorStake` +`tree_index`, −`last_change_slot`; `Dispute` +`frozen_root`.

## Acceptance

- MST builder unit-test matches on-chain verify on a fixture.
- Per-seat `draw_seat` round-trips end-to-end via the SDK.
- Snapshot methods + types removed from the package entrypoint.
- Types match the rebuilt IDL after `accord-g74z`.

## References

ADR-0012; `accord-g74z`; `accord-tzo0` (per-seat draw + sampling); ADR-0010
(SDK facade).

## Blocker — blocked on `accord-g74z` (on-chain accumulator not implemented)

Re-dispatched 2026-08-06 after `af21c7b` ("chore: unblock bean") removed the
prior block (commit `6c6e932`) **without changing the on-chain program**.
Re-verified the state is unchanged: the on-chain program is still the **old
optimistic-snapshot design**.

Evidence (re-checked this dispatch):

- `JurorStake` still has `last_change_slot` (state.rs:69); no `tree_index`.
- `Subaccord` has no accumulator fields (`root_hash`/`total_stake`/`next_index`/
  `depth`).
- `Dispute` has `committed_vrf` but no `frozen_root` (state.rs:124).
- `Snapshot` struct + `post_snapshot`/`challenge_snapshot`/`finalize_snapshot`
  instructions still exist (lib.rs:485-792).
- `draw` is still one-shot (no `draw_seat`).
- `verify_mst_inclusion` (lib.rs:1894) is still cumulative-from-left, NOT
  subtree-sum.
- No `target/idl/`, no `target/deploy/*.so`, no `target/types/` — nothing built.
- Parent `accord-g74z` is `status: todo` — the on-chain accumulator has not been
  started. No child bean exists for the Rust implementation (children are docs /
  tests / SDK / ADRs only).

All four acceptance criteria are unmeetable until the program lands:

1. **"Types match the rebuilt IDL after accord-g74z"** — no IDL exists; the
   `generated/` tree is Codama output produced from it.
2. **"MST builder unit-test matches on-chain verify on a fixture"** — on-chain
   `verify_mst_inclusion` is still the old design; a subtree-sum builder written
   now is an unverifiable guess at the on-chain byte layout (domain separator,
   sum encoding, node-hash preimage) and risks full rework.
3. **"Per-seat `draw_seat` round-trips end-to-end"** — `draw_seat` does not
   exist on-chain or in any IDL.
4. **"Snapshot methods + types removed from entrypoint"** — the live program
   still defines them; removing now orphans the SDK↔IDL lockstep and the e2e
   suite, and the `generated/` builders still reappear from the unchanged IDL.

Action: `blocked_by: accord-g74z` re-recorded, status `todo`. **No speculative
SDK code written** — will match the real IDL in one verified pass once `accord-g74z`
lands the accumulator + rebuilt IDL. The prior block (`6c6e932`) was correct;
`af21c7b` unblocked prematurely. This bean needs the on-chain Rust implementation
of ADR-0012 to exist first.
