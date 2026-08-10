# Stake Accumulator — why the root is canonical

The juror-set root is a **live on-chain stake accumulator**, not a posted
claim. There is no poster, no bond, no 1-day challenge window, and no fraud
predicates — the root cannot be withheld or fabricated because it is maintained
by the protocol on every `stake`/`unstake` ([ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md);
supersedes the optimistic snapshot layer of ADR-0003/0008/0009).

## Why no fraud proofs are needed

ADR-0003/0008 stored only a 32-byte root and trusted an off-chain indexer to
post it, bonded, with a 1-day fraud-proof window. Two fatal gaps share a root
cause — the snapshot was a _separate off-chain commitment reconciled with live
state_, and that reconciliation was trust-dependent:

- **Data availability (CONCEPT-REVIEW Bad 4).** The chain stored only the root;
  nothing forced the poster to publish the tree. A poster could post a fraudulent
  root and withhold the data — every fraud predicate needed leaves from the
  _posted_ tree, so none was constructible. Detection was possible but on-chain
  voiding was impossible; the bond was always returned.
- **Unauthenticated sums (Bad 5).** The internal node hash excluded child sums,
  so stake-weighted ranges were not cryptographically bound — a poster could
  inflate a colluding juror's selection range undetectably.

The accumulator deletes both problems by construction: there is no posted root
to withhold (Bad 4), and sums are bound into node hashes (Bad 5).

## How the root stays canonical

```
Leaf:    (juror: Pubkey, stake: u64)
Node:    H(left_hash ‖ left_sum ‖ right_hash ‖ right_sum),  node.sum = left_sum + right_sum
Root:    (root_hash, total_stake)   — stored on Subaccord: + next_index, depth
```

- **Maintained live.** `stake`/`unstake` verify the caller-supplied leaf path
  against the stored root, read the **live** `JurorStake.amount`, apply the
  verified vault delta, and recompute the path (O(log N)). A wrong path reverts —
  it cannot corrupt the root.
- **Off-chain verifiable.** The program cannot enumerate accounts
  (`getProgramAccounts` is RPC-only), so the full tree is held by indexers.
  Any auditor can rebuild the root from `JurorStake` via `getProgramAccounts`
  and check it against the on-chain value — verifiable, not trusted.
- **Frozen at VRF-commit.** The live root is copied to `dispute.frozen_root` in
  `commit_vrf_callback`, atomically with the randomness. Capital stays fully
  live until the draw; freezing when randomness becomes known closes the
  manipulation window.

## What was deleted

`post_snapshot`, `challenge_snapshot`, `finalize_snapshot`, the snapshot bond,
the 1-day window, and all four fraud predicates (Duplicate / Omission /
WrongStake / NotSorted) are gone. The draw-time **inflation guard**
(`JurorStake.amount ≥ leaf.stake`, a live read) is retained — it is race-immune
and never depended on the snapshot.

```mermaid
graph LR
  J[JurorStake amount] -->|live read| V[stake/unstake verifies path vs root]
  V -->|recompute O(log N)| R[Subaccord root_hash + total_stake]
  R -->|frozen at VRF-commit| F[Dispute.frozen_root]
  F -->|draw_seat verifies| D[panel]
  A[Any auditor getProgramAccounts] -.->|rebuild + compare| R
```

Why: [ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md). Sortition consumption: [sortition & VRF](sortition-vrf.md).
