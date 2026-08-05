---
# accord-ewzf
title: 'Accumulator — SDK: subtree-sum MST builder, per-seat draw_seat, drop snapshot methods (ADR-0012)'
status: todo
type: task
priority: high
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T17:12:02Z
parent: accord-g74z
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
- **Types**: `Subaccord` +`root/total_stake/next_index/depth`; `JurorStake`
  +`tree_index`, −`last_change_slot`; `Dispute` +`frozen_root`.

## Acceptance

- MST builder unit-test matches on-chain verify on a fixture.
- Per-seat `draw_seat` round-trips end-to-end via the SDK.
- Snapshot methods + types removed from the package entrypoint.
- Types match the rebuilt IDL after `accord-g74z`.

## References

ADR-0012; `accord-g74z`; `accord-tzo0` (per-seat draw + sampling); ADR-0010
(SDK facade).
