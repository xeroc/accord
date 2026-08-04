---
# veridao-4nyi
title: Stake-weighted verifiable sortition — MST, commit_vrf + draw, NotSorted + Omission proofs
status: in-progress
type: feature
priority: critical
created_at: 2026-08-04T17:18:39Z
updated_at: 2026-08-04T17:18:39Z
parent: veridao-rlno
blocked_by:
    - veridao-utcu
---

## Scope

ADR-0009. Implements on-chain verifiable stake-weighted sortition, closing the
cherry-picking attack (bean veridao-utcu) and the omission attack. Three pieces:

### 1. Merkle-Sum Tree migration

Replace the plain SHA-256 Merkle root with an MST where each node commits to
`(hash, sum)`. Leaves are sorted by juror pubkey and include `cum_after: u64`
(running stake total). The root commits to both `hash` and `total_stake`.

State changes:

- `LeafClaim`: add `cum_after: u64`
- `Snapshot`: add `total_stake: u64` (MST root sum)
- New `MSTNode { sibling_hash: [u8;32], sibling_sum: u64 }` proof element type
- `verify_merkle_inclusion` → `verify_mst_inclusion`: verifies hash + sum
  consistency along the proof path
- `post_snapshot` gains `total_stake` instruction arg

### 2. Sortition enforcement (commit_vrf + draw refactor)

Two-instruction design (commit survives draw revert):

- `commit_vrf(vrf_result)` — stores `Dispute.committed_vrf`, one-shot,
  permissionless. Always succeeds.
- `draw(draw_attempt, memberships)` — reads committed VRF, derives
  `vrf_seed = hash(vrf_result ‖ dispute ‖ round ‖ draw_attempt)`, computes
  `r_i = u64::from_le_bytes(hash(vrf_seed ‖ i)[0..8]) % total_stake` per slot,
  verifies `cum_before ≤ r_i < cum_after` for each membership. On collision:
  Err (reverts Round init; committed_vrf persists). Cranker retries with
  incremented draw_attempt.

No rejection sampling (caller-chosen nonce enables brute-force cherry-picking).

### 3. Fraud predicates 2 + 5 (Omission + NotSorted)

- `FraudProof::NotSorted` — two leaves at indices i < j where
  `leaf[i].juror > leaf[j].juror`. Forces sorted-by-pubkey trees.
- `FraudProof::Omission` — two adjacent leaves (consecutive indices)
  bracketing the challenger's pubkey + the challenger's JurorStake showing
  `last_change_slot < anchor_slot` and `amount > 0`.

Edge case residual: a juror whose pubkey is smaller than leaf[0] or larger
than the last leaf cannot challenge via the two-adjacent-leaves approach.
Accepted — statistically negligible and the non-extreme jurors can still
challenge.

## Tasks

- [ ] ADR-0009 written
- [ ] ADR-0008 updated with commit_vrf rationale
- [ ] State changes (LeafClaim, Snapshot, Dispute, MSTNode, FraudProof enum)
- [ ] commit_vrf instruction + context
- [ ] draw refactor (MST verification, sortition check, draw_attempt)
- [ ] post_snapshot updated (total_stake arg)
- [ ] challenge_snapshot extended (NotSorted + Omission)
- [ ] Errors added (SortitionMismatch, NotSorted, OmissionProofInvalid)
- [ ] Tests: state.rs, snapshot_litesvm.rs, draw_litesvm.rs + new tests
- [ ] Build + 73+ tests green + clippy clean

## Acceptance

- draw rejects memberships that don't match the VRF-derived sortition
- draw rejects inflated leaves (predicate 4, existing)
- challenge_snapshot voids an unsorted tree (NotSorted)
- challenge_snapshot voids a tree missing a staked juror (Omission)
- commit_vrf is one-shot (second call errors)
- Retry with incremented draw_attempt produces different r_i values
- All existing tests updated and green

## Relationships

- Parent: veridao-rlno
- Blocked-by: veridao-utcu (fraud predicates 1/3/4 shipped — this extends to 2/5)
- Supersedes veridao-i4jm item #2 (richer fraud proof) — fully addressed here
