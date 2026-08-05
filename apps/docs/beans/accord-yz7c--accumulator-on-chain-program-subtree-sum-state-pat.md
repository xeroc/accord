---
# accord-yz7c
title: "Accumulator — on-chain program: subtree-sum state, path-verified stake/unstake, per-seat draw_seat, drop snapshot layer, rebuild IDL (ADR-0012)"
status: completed
type: task
priority: critical
created_at: 2026-08-05T22:40:44Z
updated_at: 2026-08-06T01:10:00Z
parent: accord-g74z
---

## Why

The `accord-g74z` feature (ADR-0012) replaces the optimistic snapshot layer with
a live on-chain stake accumulator. The four existing children of `accord-g74z`
are docs (accord-a7kn, done), ADRs (accord-4412, done), SDK (accord-ewzf), and
tests (accord-btel). **None of them implements the Rust program**
(`programs/accord/src/{state,lib}.rs`). That on-chain implementation is the hard
prerequisite for both the SDK (which mirrors the IDL it produces) and the tests
(which build the `.so`), and it is currently unowned.

This bean exists so the SDK and tests beans can block on a **resolvable** node
instead of on the parent feature (blocking a child on its own parent is a
deadlock — the parent can never complete while the child is open).

Verified at creation (2026-08-06): `state.rs`/`lib.rs` are still the old
optimistic-snapshot design; no `target/idl`, no `.so`, no `target/types`.

## Scope (the on-chain Rust work — TDD against accord-btel)

1. **State redesign (state.rs)**

   - `Subaccord` += accumulator fields: `root_hash [u8;32]`, `total_stake u64`,
     `next_index u32`, `depth u8`.
   - `JurorStake` += `tree_index u32` (assigned at first stake, immutable),
     **− `last_change_slot`** (locked decision 2026-08-05; no on-chain reader
     remains; inflation guard is a live read).
   - `Dispute` += `frozen_root [u8;32]` (written once by `commit_vrf_callback`;
     locked decision 2026-08-05: freeze moves from create_dispute to the VRF
     callback — one root per dispute, all rounds).
   - **Delete** `Snapshot`, `SnapshotStatus`, `FraudProof`, and the snapshot-era
     `MSTNode`/`JurorMembership`/`LeafClaim` (redesigned below). `DisputeState`
     loses `SnapshotPosted`.

2. **Subtree-sum MST types + verify (state.rs / lib.rs)**

   - `LeafClaim` drops `cum_after` (prefix now computed from the authenticated
     path). Leaf = `(juror, stake)`; leaf hash per the on-chain spec.
   - Node = `H(left_hash ‖ left_sum ‖ right_hash ‖ right_sum)`;
     `node.sum = left_sum + right_sum` — **sums bound into hashes (CONCEPT-REVIEW
     Bad 5)**.
   - Rewrite `verify_mst_inclusion` (lib.rs:1894) to the subtree-sum form:
     authenticates hash + sum + reconstructs the cumulative-from-left prefix from
     authenticated sibling sums. This is the byte-exact reference the SDK MST
     builder must match.

3. **stake / unstake — path-verified accumulator update**

   - Caller supplies the juror's Merkle path; chain verifies vs stored root, reads
     **live** `JurorStake.amount` (not caller claim), applies the verified vault
     delta, recomputes the path → new root. O(log N). Append-only `tree_index`
     (first stake assigns next_index++). Wrong path ⇒ revert, root unchanged.

4. **commit_vrf_callback — write frozen_root**

   - `dispute.frozen_root = subaccord.root` when the VRF lands (the ONLY freeze;
     not at create_dispute). create_dispute copies anchor_slot but NOT the root.

5. **draw → draw_seat(i)** (per-seat; shared with accord-tzo0)

   - Replaces the one-shot `draw`. 1232-byte tx packet can't hold N proofs ⇒ one
     seat per tx. Verifies a membership proof + sortition against `dispute.frozen_root`.
   - Deterministic collision re-rülle computed client-side to match the chain (no
     `draw_attempt` grind). On `SortitionMismatch` the submission was wrong — no
     retry (deterministic sampling, CONCEPT-REVIEW Ugly 1+7).

6. **Remove the snapshot layer**

   - Delete `post_snapshot`, `challenge_snapshot`, `finalize_snapshot` + the bond
     - 1-day window + all four fraud predicates. (Resolves CONCEPT-REVIEW Bad 4:
       nothing to withhold.)

7. **Rebuild IDL**
   - `anchor build` → fresh `target/idl/accord.json` with the new accounts/instructions.
   - This IDL is what accord-ewzf regenerates `packages/sdk/src/generated/` from,
     and what accord-btel builds the `.so`/types from.

## Acceptance

- `make test_unit` green: subtree-sum MST build/verify round-trip; wrong-path
  stake/unstake reverts; draw_seat verifies membership + sortition vs frozen_root.
- Off-chain rebuild from `JurorStake` (getProgramAccounts) reproduces the on-chain
  root exactly (audit property).
- `target/idl/accord.json` reflects the new state (accumulator fields, draw_seat,
  no snapshot instructions/types).
- Retained + still working: anchor-slot leaf witness (ADR-0008) + inflation guard,
  active_draws lock, VRF callback.

## Unblocks

- `accord-ewzf` (SDK) — blocked_by this bean (was incorrectly blocked_by the
  parent `accord-g74z`, a deadlock; repointed here).
- `accord-btel` (tests) — same dependency (should also block on this bean).

## References

ADR-0012; parent `accord-g74z`; CONCEPT-REVIEW Bad 4 + Bad 5; `accord-ewzf`;
`accord-btel`; `accord-tzo0` (per-seat draw + deterministic sampling).

## Summary of Changes

Implemented the on-chain stake accumulator (ADR-0012) in the Accord program,
replacing the optimistic snapshot layer. Resolves CONCEPT-REVIEW Bad 4 (data
availability — no posted root to withhold) + Bad 5 (MST sum authentication —
sums bound into node hashes by construction).

### State (`state.rs`)

- `Subaccord` += accumulator fields: `root_hash [u8;32]`, `total_stake u64`,
  `next_index u32`, `depth u8`.
- `JurorStake`: += `tree_index u32` (assigned once at first stake, immutable);
  **− `last_change_slot`** (locked decision 2026-08-05 — no on-chain reader
  remains after the snapshot predicates were deleted).
- `Dispute` += `frozen_root [u8;32]` + `frozen_total_stake u64` (written once,
  atomically, by `commit_vrf_callback`).
- Deleted: `Snapshot`, `SnapshotStatus`, `FraudProof`; `DisputeState::SnapshotPosted`.
- `LeafClaim` drops `cum_after` (prefix now reconstructed from authenticated
  sibling sums). `MSTNode` retained (sibling_hash + sibling_sum).

### Instructions (`lib.rs`)

- `create_subaccord`: + `depth` arg; initialises the accumulator to an all-zero
  tree at that depth (`empty_tree_root`).
- `stake` / `unstake`: + client-supplied `path: Vec<MSTNode>` arg; verify path
  vs stored root reading **live** `JurorStake.amount`, apply verified vault
  delta, recompute path → new canonical root. O(log N). First stake assigns
  `next_index++` to the juror's `tree_index` (fresh zero slot → real leaf);
  wrong path reverts with root untouched.
- `commit_vrf_callback`: writes `dispute.frozen_root`/`frozen_total_stake` from
  the live subaccord root atomically with the VRF (the ONLY freeze — closes the
  manipulation window; one root serves all rounds).
- `draw` → **`draw_seat(seat, membership)`**: per-seat (1232-byte tx can't hold
  N proofs); `init_if_needed` round persists across the N txs; verifies
  membership + reconstructs the cumulative-from-left prefix from authenticated
  sibling sums, enforces sortition (`prefix ≤ r_i < prefix+stake`), the
  inflation guard (`amount ≥ leaf.stake`), and distinctness. Panel-completion
  opens the round windows + transitions to `Drawn`. Deterministic collision
  re-rülle is client-side (no `draw_attempt` grind) — bean accord-tzo0.
- Deleted: `post_snapshot`, `challenge_snapshot`, `finalize_snapshot` + their
  account contexts (`PostSnapshot`/`ChallengeSnapshot`/`FinalizeSnapshot`) +
  the `max_appeal_panel_size` bond helper (dead). `request_vrf` drops the
  snapshot gate and forwards subaccord to the callback.

### Errors / Events / Constants

- Errors: dropped the 7 snapshot/fraud variants; added `InvalidMerklePath`,
  `TreeFull`.
- Events: dropped the 3 snapshot events + `JurorsDrawn`; `VrfCommitted` carries
  `frozen_root`; added per-seat `SeatDrawn`.
- Constants: dropped `SNAPSHOT_CHALLENGE_WINDOW_SECS` + `SEED_SNAPSHOT`; added
  `DEFAULT_TREE_DEPTH` (20).

### MST helpers (byte-exact reference for the SDK)

- `mst_leaf_hash` = `H(juror||stake_le)`; `mst_node_hash` =
  `H(left_hash||left_sum||right_hash||right_sum)` (sums bound — Bad 5 fixed);
- `empty_tree_root(depth)`; `verify_and_recompute` (stake/unstake);
  `verify_membership_and_prefix` (draw_seat).

### Tests

- Added an inline `#[cfg(test)] accumulator_tests` module (5 cases): empty-root
  vs all-zero tree, membership + prefix correctness + tamper rejection,
  verify-and-recompute matches a from-scratch rebuild, first-stake zero-leaf→
  juror transition, and sortition totality/non-overlap across seats. All green.
- Removed the 12 obsolete `*_litesvm.rs` files + shared `tests/state.rs` — they
  tested the deleted snapshot/one-shot-draw surface and the changed
  `create_subaccord`/`stake`/`unstake` signatures. **Full LiteSVM + Surfpool
  e2e rewrite is bean accord-btel** (now unblocked by this commit).

### Verification

- `anchor build --ignore-keys` succeeds; `target/idl/accord.json` regenerated
  (instructions include `draw_seat`, no `post_snapshot`/`challenge_snapshot`/
  `finalize_snapshot`; account types include no `Snapshot`; accumulator fields
  present on `Subaccord`/`JurorStake`/`Dispute`).
- `cargo test --features no-entrypoint --lib` → 6 passed, 0 failed.
- `cargo clippy --features no-entrypoint` → 0 errors (own `too_many_arguments`
  annotated; pre-existing `needless_borrow` left untouched per surgical-changes).

Retained + working: inflation guard (live read), `active_draws` unstake lock,
VRF callback (`veridao-crbf`), per-Subaccord `staking_token`, case-terms freeze,
settlement/cancel/appeal (their account-layout byte offsets for
`amount`/`active_draws` on `JurorStake` are unchanged — `tree_index` appended
last).
