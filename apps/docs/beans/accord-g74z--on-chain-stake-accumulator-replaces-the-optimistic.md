---
# accord-g74z
title: On-chain stake accumulator replaces the optimistic snapshot (resolves Bad 4 + Bad 5; ADR-0012)
status: todo
type: feature
priority: critical
created_at: 2026-08-05T16:20:23Z
updated_at: 2026-08-05T17:12:01Z
parent: accord-ukqg
---

## Why

CONCEPT-REVIEW Bad 4 (data availability) + Bad 5 (MST sums not authenticated) share
a root cause: the snapshot is a SEPARATE off-chain commitment that must be
reconciled with live state, and that reconciliation is trust-dependent. A poster
can post a fraudulent root and WITHHOLD the tree — every fraud predicate needs the
POSTED tree's leaves, so none is constructible; detection (rebuild the correct tree
from public JurorStake state) is possible but on-chain VOIDING is impossible. The
bond is always returned; dispute capture costs ~0. Bad 5's unauthenticated sums
compound this (a poster can inflate selection ranges undetectably).

ADR-0008/0009's elaborate predicates are uncallable without data. The optimistic-
snapshot trust model is internally contradictory: we bond the poster because we
distrust it, then give it a trivial data-withholding escape.

## How (agreed — ADR-0012)

Replace the optimistic snapshot layer with a LIVE on-chain stake accumulator. The
root becomes canonical by construction — there is no posted root to withhold or
fabricate.

1. Subtree-sum MST: leaf = (juror, stake); node = H(left_hash ‖ left_sum ‖
   right_hash ‖ right_sum); node.sum = left_sum + right_sum. Sums bound into hashes
   (Bad 5 fixed). One-leaf change = O(log N) ancestors only. The cumulative-from-
   left MST of ADR-0009 is O(N) to update and CANNOT be maintained incrementally —
   this redesign is mandatory.
2. Root-only on-chain (Subaccord: root_hash 32B + total_stake 8B + next_index 4B +
   depth 1B); full tree off-chain (indexers). Program cannot enumerate accounts
   (getProgramAccounts is RPC-only) → root maintained incrementally via client-
   supplied paths verified against the stored root. A wrong path reverts — cannot
   corrupt the root. Off-chain, any indexer/auditor CAN rebuild the root from
   JurorStake (getProgramAccounts) and audit it — verifiable, not trusted.
3. Append-only tree; tree_index (u32) on JurorStake, assigned at first stake, never
   changed. Depth fixed per-Subaccord at creation (bounds pool at 2^depth). Joining
   is LOCAL — no other juror's data changes; locality keeps updates O(log N).
4. stake/unstake: caller supplies the juror's leaf path; chain verifies vs stored
   root, reads live JurorStake.amount (not caller claim), applies verified vault
   delta, recomputes path → new root. O(log N).
5. create_dispute copies current root + anchor_slot onto the Dispute (frozen).
   Capital fully live — NO freeze (ADR-0008 DoS objection n/a).
6. ELIMINATES post_snapshot / challenge_snapshot / finalize_snapshot / bond / 1-day
   window / all four fraud predicates. Resolves Bad 4 (nothing to withhold) + Bad 5
   (sums bound by construction).
7. RETAINS: anchor-slot leaf witness (ADR-0008) + inflation guard for draw-proof
   construction; active_draws lock; VRF callback (veridao-crbf); deterministic
   sampling (Ugly 1, bean accord-tzo0).

## TDD acceptance

- Build a tree off-chain, compute root; on-chain accumulator matches after a
  sequence of stake/unstake updates (each via client-supplied path).
- A client-supplied WRONG path (stale or fabricated) reverts; root unchanged.
- An off-chain rebuild from JurorStake (getProgramAccounts) reproduces the on-chain
  root exactly (audit property).
- A stake change updates ONLY the acting juror's path; other jurors' tree_index /
  leaf unchanged.
- draw_seat verifies a membership proof + sortition against the frozen root
  (subtree-sum prefix from authenticated sibling sums).
- post_snapshot / challenge_snapshot / finalize_snapshot removed from the IDL.

## Constraints (explicit v1)

- Per-Subaccord fixed depth (default 20 ≈ 1M seats; configurable). Pool capped at
  2^depth; outgrowing = new Subaccord or v2 migration.
- Every stake/unstake needs a client-supplied path (indexer LIVENESS dependency;
  not a correctness risk — a wrong path reverts).
- draw is per-seat (1232-byte tx packet can't hold N proofs) — see accord-tzo0.

## References

ADR-0012; supersedes the snapshot layer of ADR-0003/0008/0009 (retains anchor-slot
leaf witness); CONCEPT-REVIEW Bad 4 + Bad 5; scraps accord-9hh7 (Bad 5 subsumed) +
accord-gh3k (repost mooted).

## Refinement (2026-08-05) — freeze timing + drop last_change_slot

1. The frozen root moves from create_dispute to commit_vrf_callback (dispute.frozen_root = subaccord.root when the VRF lands). Rationale: (a) per-seat draw coherence — all N draw_seat txs must share one root; (b) manipulation resistance — a live root lets an attacker who sees the public VRF solve for the stake delta that lands their keys on the panel. Freezing when randomness becomes known closes the window (pre-callback blind, post-callback inert). One VRF + one frozen root per dispute; appeals draw a larger panel from the same fixed pool.
2. last_change_slot is DROPPED from JurorStake. It existed only as the ADR-0008 WrongStake/Omission witness, which the accumulator deletes. The inflation guard (JurorStake.amount >= leaf.stake) is a live read and never used it. -8 bytes/juror. Crankers track historical tree state themselves.

## Locked decisions (2026-08-05)

1. commit_vrf_callback writes dispute.frozen_root = subaccord.root (the ONLY freeze; not at create_dispute; one root per dispute, all rounds).
2. last_change_slot is REMOVED from JurorStake (no on-chain reader remains; inflation guard is a live read).
