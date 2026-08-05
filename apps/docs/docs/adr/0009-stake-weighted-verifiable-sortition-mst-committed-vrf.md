# Stake-weighted verifiable sortition — Merkle-Sum Tree, committed VRF, on-chain selection enforcement

## Status

**Proposed.** Implements the sortition enforcement and omission halves of
ADR-0008's v1.1 scope. Depends on ADR-0008 (anchor-slot pattern, predicates 1,
3, 4 — shipped). Supersedes the deferred items in bean `veridao-utcu` and fully
addresses bean `veridao-i4jm` item #2 (richer fraud proof).

## Context

ADR-0008 shipped three of four snapshot fraud predicates (duplicate, wrong-stake
challenge, inflation guard at draw). These verify **individual leaf integrity** —
every leaf that exists in the snapshot is provably correct.

Two attack classes remain open:

1. **Cherry-picking**: the draw caller submits any N distinct jurors from the
   snapshot as `memberships`. The VRF seed is emitted for audit but never
   constrains which jurors the caller may submit. The caller picks the panel,
   not the VRF.

2. **Omission**: the poster excludes honest jurors from the snapshot. The
   remaining leaves are individually correct (right juror, right stake, no
   duplicates) — predicates 1, 3, 4 pass. There is no leaf for an omitted juror
   to point at and challenge.

Combined, these allow a single actor to capture any dispute for ~1 dispute fee:
post a snapshot containing only their sockpuppets, wait 1 day, cherry-pick those
jurors at draw.

## Decision

### 1. Merkle-Sum Tree

Replace the plain SHA-256 Merkle root with an MST where each node commits to
both a hash and a stake sum. Leaves are sorted by juror pubkey.

```
Leaf (sorted by juror pubkey ascending):
  { juror: Pubkey, stake: u64, cum_after: u64 }
  cum_after = stake_0 + stake_1 + ... + stake_i (running sum)

Internal node:
  { hash: [u8;32], sum: u64 }
  hash = H(left.hash ‖ right.hash)
  sum  = left.sum + right.sum

Root:
  { hash: [u8;32], sum: u64 = total_stake }
```

**Proof format** changes from `Vec<[u8;32]>` (sibling hashes only) to
`Vec<MSTNode>` where each element carries both the sibling hash and the sibling
sum:

```rust
pub struct MSTNode {
    pub sibling_hash: [u8; 32],
    pub sibling_sum: u64,
}
```

Each proof is ~40 bytes per level (32 + 8). For a pool of 100 jurors (tree depth
7), a proof is ~280 bytes. For the max pool (2^31 leaves, depth 31), ~1240 bytes
— well within Solana's 10KB account data limit for instruction args.

**Verification** (`verify_mst_inclusion`): reconstructs both the root hash AND
the root sum from the leaf + sibling hashes + sibling sums. For each level:

- `node_hash = H(left_hash ‖ right_hash)` (position determined by index bit)
- `node_sum = left_sum + right_sum`
- Verify against the expected sibling at each level.

The root hash and root sum are both stored on `Snapshot`:

- `Snapshot.merkle_root: [u8;32]` (existing, unchanged)
- `Snapshot.total_stake: u64` (new — the MST root sum)

**Why sorted by pubkey**: required for omission proofs (section 3). The sortition
itself (section 2) works with any leaf order — cumulative ranges are position-
dependent, not pubkey-dependent. Sorting is purely for the non-inclusion proof.

### 2. Sortition enforcement — committed VRF + deterministic selection

#### The commit/retry problem

A single `draw` instruction that both commits the VRF result and checks the
selection has a revert problem: if the draw fails (collision between VRF-selected
jurors), the entire transaction reverts — including the VRF commitment write.
The retry starts with no committed VRF; the caller could pass a different
`vrf_result`, brute-forcing VRF results until one selects favorable jurors.

**Solution**: split into two transactions.

```
Tx 1: commit_vrf(vrf_result)
  └─ dispute.committed_vrf = Some(vrf_result)
  └─ one-shot (errors if already committed)
  └─ always succeeds — lightweight field write, no Round creation

Tx 2: draw(draw_attempt, memberships)
  └─ reads committed_vrf (immutable; can't swap between retries)
  └─ vrf_seed = hash(vrf_result ‖ dispute ‖ round ‖ draw_attempt)
  └─ per slot i: r_i = u64::from_le_bytes(hash(vrf_seed ‖ i)[0..8]) % total_stake
  └─ verifies cum_before ≤ r_i < cum_after for each membership
  └─ success → init Round, dispute → Drawn
  └─ collision → Err (Round init reverts; committed_vrf persists on Dispute)

Tx 3 (retry): draw(draw_attempt=1, memberships)
  └─ same committed_vrf, different seed → different r_i values
```

The VRF commitment is in a separate transaction that always succeeds. Failed
draws revert the Round creation but NOT the VRF commitment (it's on the Dispute
account, which existed before the draw tx). The cranker retries `draw` with
incremented `draw_attempt` until no collision.

#### Selection algorithm (on-chain)

```rust
let vrf_seed = hashv(&[
    committed_vrf,
    dispute.key().as_ref(),
    &round_idx.to_le_bytes(),
    &draw_attempt.to_le_bytes(),
]);

for i in 0..panel_size {
    let r_hash = hashv(&[&vrf_seed, &(i as u32).to_le_bytes()]);
    let r_i = u64::from_le_bytes(r_hash[0..8].try_into().unwrap()) % total_stake;
    let cum_before = memberships[i].leaf.cum_after.saturating_sub(memberships[i].leaf.stake);
    require!(cum_before <= r_i && r_i < memberships[i].leaf.cum_after, SortitionMismatch);
}
```

The selection is fully deterministic given `(vrf_result, dispute, round,
draw_attempt)`. The caller has zero influence over which jurors are selected —
they can only choose the `draw_attempt` (which uniformly changes all r_i values)
and the `vrf_result` (which is committed once and immutable across retries).

#### Why no rejection sampling

If the caller could choose a per-slot `nonce` for re-rolling individual slots,
they could brute-force nonces until the VRF lands on their preferred juror —
re-introducing the cherry-picking attack. Failing on collision and retrying the
whole draw with a new `draw_attempt` is the only design where the caller has zero
per-slot influence.

#### Modular bias

`u64::from_le_bytes(hash[0..8]) % total_stake` has a negligible bias of
`total_stake / 2^64` — less than `2^-24` for any realistic total stake (< 2^40).
Accepted for v1.1.

#### Collision probability

P(at least one collision in panel of N from pool of P) ≈ N²/(2P):

| Pool size | N=3  | N=7   | N=15  |
| --------- | ---- | ----- | ----- |
| 50        | 9.0% | 49%   | ~100% |
| 100       | 4.5% | 24.5% | ~100% |
| 500       | 0.9% | 4.9%  | 22.5% |

For v1 defaults (N=3, pool >50), the cranker retries 1-2 times on average.

### 3. Fraud predicates 2 (Omission) + 5 (NotSorted)

#### Predicate 5 — NotSorted (new)

```rust
FraudProof::NotSorted {
    leaf_lo: LeafClaim, proof_lo: Vec<MSTNode>, index_lo: u32,
    leaf_hi: LeafClaim, proof_hi: Vec<MSTNode>, index_hi: u32,
}
```

Chain verifies:

1. Both leaves verify against the MST root (hash + sum).
2. `index_lo < index_hi` (lo comes before hi in the tree).
3. `leaf_lo.juror > leaf_hi.juror` (out of order — proves the tree is unsorted).

If any tree is unsorted, any observer with the full leaf set can void it. This
forces posters to submit sorted trees, which is the precondition for predicate 2.

#### Predicate 2 — Omission (new)

```rust
FraudProof::Omission {
    leaf_lo: LeafClaim, proof_lo: Vec<MSTNode>, index_lo: u32,
    leaf_hi: LeafClaim, proof_hi: Vec<MSTNode>, index_hi: u32,
}
```

The challenger's pubkey is `ctx.accounts.challenger.key()`. Chain verifies:

1. Both leaves verify against the MST root.
2. `index_hi == index_lo + 1` (consecutive — no leaf between them).
3. `leaf_lo.juror < challenger.key() < leaf_hi.juror` (challenger falls in the
   gap — not in the tree).
4. Challenger's `JurorStake` (remaining_accounts[0]): `last_change_slot <
anchor_slot` AND `amount > 0` (was staked at anchor time).

All four conditions → the snapshot omitted a juror who was provably staked →
**fraud → void**.

**Edge case residual**: a juror whose pubkey is smaller than `leaf[0]` or larger
than the last real leaf cannot find two adjacent leaves bracketing their pubkey.
This is accepted: the attacker cannot engineer all honest jurors into the extreme
tails without the non-extreme ones being omittable and challengeable. The
residual is statistically negligible for pools >10.

### Complete fraud predicate surface (after this ADR)

| #   | Fraud class     | Predicate                                              | Enforced at | Witness                  |
| --- | --------------- | ------------------------------------------------------ | ----------- | ------------------------ |
| 1   | Duplicate juror | Two leaves, same juror                                 | Challenge   | Inclusion proofs         |
| 2   | Omission        | Adjacent leaves bracket challenger + watermark         | Challenge   | JurorStake + range proof |
| 3   | Wrong-stake     | `last_change_slot < anchor && amount ≠ leaf.stake`     | Challenge   | JurorStake + inclusion   |
| 4   | Inflation       | `JurorStake.amount < leaf.stake`                       | Draw        | Live JurorStake          |
| 5   | NotSorted       | `index_lo < index_hi && leaf_lo.juror > leaf_hi.juror` | Challenge   | Two inclusion proofs     |

Plus: sortition enforcement at draw (VRF determines selection, caller can't
cherry-pick).

## Considered Options

### Uniform-random selection instead of stake-weighted (rejected)

`r_i = hash(vrf_seed ‖ i) % num_leaves` — the chain verifies the leaf at index
`r_i`. Zero tree structure changes (~20 lines). But gives up stake-weighting:
each juror has equal draw probability regardless of stake. Incentivizes
sockpuppet fragmentation (splitting capital into many min-stake accounts for more
draw slots). Rejected because the Schelling-point economics depend on
stake-proportional draw probability.

### Rejection sampling for distinctness (rejected)

Per-slot nonce: `r_i = hash(vrf_seed ‖ i ‖ nonce)`. If a duplicate is drawn,
increment `nonce` and re-roll just that slot. Cheaper than retrying the whole
draw. But the caller can brute-force nonces per slot until the VRF lands on their
preferred juror — re-introducing cherry-picking. Rejected.

### Per-juror stake history ring buffer (rejected, again)

Adding `(slot, amount)` history per juror to close the case where a juror changes
stake during the challenge window. Rejected: predicate 4 (inflation guard at
draw) is race-immune, and the deflation challenge only fails if the juror
THEMSELVES changed stake — their choice, their consequence.

## Consequences

- **Sortition is deterministic and on-chain verifiable.** Given a committed VRF
  result, the panel is fully determined. The caller cannot cherry-pick.

- **VRF result is committed once and immutable.** `commit_vrf` is a one-shot
  instruction; retries read the committed value. The caller cannot brute-force
  VRF results between retries. (Closing the brute-force fully requires oracle-
  verified VRF — magicblock integration, still deferred.)

- **Omission is individually challengeable.** Every omitted juror can prove
  non-inclusion via two adjacent sorted leaves + their JurorStake watermark. Any
  bounty hunter can challenge on any juror's behalf.

- **Unsorted trees are voidable.** The NotSorted predicate forces posters to
  submit sorted trees, making the omission proof reliable.

- **MST migration is backward-incompatible.** Leaf format, proof format, and
  snapshot fields all change. Pre-deployment — no migration needed.

- **Two instructions instead of one.** `commit_vrf` + `draw` replaces the
  single `draw`. The extra round-trip is one lightweight tx (field write only).

- **Collision retries are expected.** The cranker must handle draw failures
  (Err) and retry with incremented `draw_attempt`. For N=3 and pool >50,
  expected retries <1.1.

## Residual trust assumptions

Stated plainly (CONCEPT-REVIEW §Ugly 8; see the [Trust Profile](../security/trust-profile.md)):

- **Randomness availability is provider-dependent.** The draw requires the
  magicblock VRF oracle to land `commit_vrf_callback`. A down, stalled, or
  censoring oracle blocks every new draw until it recovers. The on-chain logic
  verifies the result but cannot produce randomness itself.
- **Brute-forcing is only partially closed.** The committed-VRF design stops
  the caller swapping randomness _between retries_, but full closure of VRF
  brute-force requires oracle-verified VRF (magicblock integration) — still
  deferred (see "Consequences" above).
- **Stake-weighting is not stake-independence.** Selection probability is
  proportional to stake, so a large stake coalition dominates the panel. The
  sortition is fair _given the stake distribution_; it does not defend against
  majority-stake capture. Appeals grow the panel but not the honest-majority
  requirement.
- **Honest-majority-stake is load-bearing.** Every "Schelling honesty" claim in
  this ADR presupposes an honest stake majority. Without it, the
  commit-reveal + coherence-slashing incentives do not converge on truth.
- **Distinct keys ≠ independent humans.** Admission is key-level pseudonymous.
  One actor operating many min-stake keys increases their draw share. This is
  ADR-0001's accepted trade-off; an identity / court-profile model is v2.
- **Snapshot-layer caveats (superseded by ADR-0012).** The MST commitment and
  fraud predicates described here are part of the **posted-snapshot** trust
  model, which CONCEPT-REVIEW Bad 4 (data availability) and Bad 5 (sum
  authentication) proved insufficient. **ADR-0012 supersedes this snapshot
  layer** with an on-chain stake accumulator: the root becomes canonical by
  construction, the poster/bond/challenge-window is deleted, and the sortition
  _criterion_ is retained in subtree-sum form. This ADR's residual assumptions
  about the VRF and the honest-majority-stake precondition survive the
  accumulator redesign; the assumptions about the snapshot poster do not.

## References

- ADR-0003 — original draw architecture (Merkle snapshot, VRF, distinct jurors)
- ADR-0008 — anchor-slot pattern, predicates 1/3/4, four-predicate design
- Bean `veridao-4nyi` — this implementation
- Bean `veridao-utcu` — critical finding (VRF bypass), predicates 1/3/4 shipped
