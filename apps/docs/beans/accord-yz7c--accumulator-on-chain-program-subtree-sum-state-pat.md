---
# accord-yz7c
title: 'Accumulator — on-chain program: subtree-sum state, path-verified stake/unstake, per-seat draw_seat, drop snapshot layer, rebuild IDL (ADR-0012)'
status: todo
type: task
priority: critical
created_at: 2026-08-05T22:40:44Z
updated_at: 2026-08-05T22:44:59Z
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
