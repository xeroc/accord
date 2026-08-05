# On-chain stake accumulator replaces the optimistic snapshot

## Status

**Proposed.** Supersedes the snapshot layer of ADR-0003, ADR-0008, and ADR-0009
(their sortition *verification* logic is retained and restated here in
subtree-sum form). Resolves CONCEPT-REVIEW Bad 4 (data availability) and Bad 5
(MST sum authentication) in a single redesign.

## Context

ADR-0003 established an optimistic snapshot: an off-chain indexer posts a Merkle
root over the juror set, bonded, with a 1-day fraud-proof window. ADR-0008/0009
hardened it (anchor-slot pattern, four fraud predicates, Merkle-Sum sortition).

Two fatal gaps remain, and they share a root cause — the snapshot is a **separate
off-chain commitment that must be reconciled with live state**, and that
reconciliation is trust-dependent:

1. **Data availability (Bad 4).** The chain stores only the 32-byte root; nothing
   forces the poster to publish the tree. A poster can post a fraudulent root and
   **withhold the data**. Every fraud predicate in `challenge_snapshot` needs
   leaves from the *posted* tree (not the correct one), so none is constructible.
   Detection is possible — rebuild the correct tree from public `JurorStake`
   state and see the roots differ — but on-chain **voiding is impossible**, so the
   bond is always returned and dispute capture costs ~0.
2. **MST sum authentication (Bad 5).** The internal node hash excludes child sums
   (`H(left_hash ‖ right_hash)`), so stake-weighted ranges are not
   cryptographically bound; a poster can inflate a colluding juror's selection
   range undetectably.

The optimistic model is internally contradictory: we bond the poster *because* we
distrust it, then hand it a trivial data-withholding escape that neutralizes the
very fraud proofs the bond underwrites.

## Decision

Replace the optimistic snapshot layer with a **live on-chain stake accumulator**
maintained incrementally on every `stake`/`unstake`. The root becomes canonical
by construction — there is no posted root to withhold or fabricate.

### 1. Subtree-sum MST (resolves Bad 5)

```
Leaf:    (juror: Pubkey, stake: u64)
Node:    H(left_hash ‖ left_sum ‖ right_hash ‖ right_sum),  node.sum = left_sum + right_sum
Root:    (root_hash, root.sum = total_stake)
```

Sums are bound into node hashes (Bad 5 fixed by construction). A one-leaf stake
change touches only that leaf's **ancestors** — siblings are untouched — so an
update is **O(log N)**. (ADR-0009's cumulative-from-left MST carries `cum_after`
per leaf; changing one stake shifts every later leaf's `cum_after`, making updates
O(N). That design cannot be maintained incrementally. The subtree-sum form is
therefore mandatory for a live accumulator, not optional.)

Sortition verification is unchanged in spirit: per seat, the chain computes the
selected leaf's prefix as the sum of left-sibling sums on right-branch levels
(= today's `cum_from_left`), now derived from **authenticated** sums, and checks
`prefix ≤ r_i < prefix + stake`.

### 2. Root-only on-chain; full tree off-chain

The Subaccord stores only `root_hash (32B) + total_stake (8B) + next_index (4B) +
depth (1B)`. The full tree lives off-chain (indexers).

The program **cannot enumerate accounts** (`getProgramAccounts` is RPC-only, not
available in BPF), so the root is maintained **incrementally** via client-supplied
Merkle paths verified against the stored root. A wrong path reverts — it cannot
corrupt the root. The indexer is therefore a **liveness** dependency (stakers need
a valid path), not a correctness one.

Off-chain, any indexer/auditor **can** rebuild the root from scratch via
`getProgramAccounts` on `JurorStake` and audit it against the on-chain value. The
accumulator is thus maintained cheaply on-chain *and* independently verifiable
off-chain.

### 3. Append-only tree; `tree_index`

- First stake appends a leaf at `next_index`; full unstake **zeros** the leaf (it
  remains in the tree with zero selection weight); re-stake reuses the stored
  index.
- `tree_index: u32` is stored on `JurorStake`, assigned once at first stake, never
  changed. u32 covers up to depth 32 and is the smallest aligned type that does.
- **Depth is fixed per-Subaccord at creation** — the tree never grows a level
  during operation; appending fills zero-leaves within the fixed depth.
- Joining/staking is **local**: only the acting juror's account and its path-to-root
  change. No other juror's data changes. This locality is what keeps every update
  O(log N).
- Leaf order (append order) does not affect selection fairness — subtree-sum
  sortition is position-independent (each juror's draw probability = stake/total).
  Sorted order was only required for omission proofs, which no longer exist.

### 4. stake / unstake update protocol

Caller supplies the juror's leaf path (sibling hashes + sums). The chain:

1. verifies the path against the stored root (hash + sum, sums bound);
2. reads the **live** `JurorStake.amount` (not the caller's claim) as the old stake;
3. applies the **verified vault delta** (fee-on-transfer safe);
4. recomputes the path to a new root and stores it. O(log N) hashes.

### 5. Root frozen at VRF-commit, not at filing

The root is **not** frozen at `create_dispute`. It is frozen in
`commit_vrf_callback`: when the VRF lands, the callback also writes
`dispute.frozen_root = subaccord.root`. Capital stays fully live between filing
and the draw (no freeze; ADR-0008's DoS objection does not apply).

A frozen root is required for two reasons, both about the draw — not about
history:

1. **Per-seat coherence.** The N `draw_seat` txs must all select against the
   *same* root, or the panel is drawn from inconsistent populations.
2. **Manipulation resistance.** With a live root, an attacker who sees the
   committed VRF (public after `commit_vrf_callback`) can solve for the stake
   delta that lands its keys on the panel and submit one stake tx before the draw
   — deterministic selection + known randomness turns selection into a solvable
   equation. Freezing the root *when the randomness becomes known* (atomically, in
   the callback) closes the window: pre-callback manipulation is blind (VRF
   unknown), post-callback manipulation is inert (root frozen).

One VRF + one frozen root serve the whole dispute; appeals draw a larger panel
from the *same* fixed pool. (A fresh root per appeal would require a fresh VRF per
round — reusing a known VRF with a new root reopens the grind — a deliberate v2
choice.)

`draw_seat` reads `dispute.frozen_root`. The cranker builds proofs against it from
its tracked tree state. The **inflation guard** (`JurorStake.amount ≥ leaf.stake`,
a live read) remains and rejects any selected juror whose live balance has since
dropped below their frozen leaf (handled by deterministic re-draw).

### 6. Eliminates the snapshot subsystem

`post_snapshot`, `challenge_snapshot`, `finalize_snapshot`, the snapshot bond, the
1-day window, and all four fraud predicates (Duplicate / Omission / WrongStake /
NotSorted) are **deleted**. The root is canonical — there is nothing to post,
challenge, or finalize. This resolves Bad 4 (no posted root to withhold) and Bad 5
(sum-bound by construction).

## Considered Options

- **Freeze stakes + reconstruct the correct tree off-chain.** Rejected — gives
  detection, not on-chain voiding (predicates still need the *posted* tree's
  leaves). Also reintroduces the ADR-0008 freeze DoS.
- **On-chain full-tree storage (capped pool).** Rejected — reintroduces the
  scaling cap ADR-0003 fled (rent ≈ 7 SOL/MB) and per-stake O(N) risk for the
  cumulative-sum form.
- **Validity proof (SNARK) that the root was built correctly.** The trustless
  destination; deferred to v2. Removes the accumulator entirely (root proven, not
  maintained) but requires proving MST construction + stake aggregation in a
  circuit.
- **Designated indexer quorum (federated attestation).** A fallback if the
  accumulator's per-stake path requirement proves too costly operationally — but
  the accumulator is trustless for correctness, so it is preferred.

## Consequences

- **Bad 4 + Bad 5 resolved.** Re-post-after-void (bean `accord-gh3k`) is mooted —
  there is no void. Bad-5 sum authentication (bean `accord-9hh7`) is subsumed —
  sum-binding is how the accumulator verifies updates.
- **Pool size is unbounded by any Solana mechanical limit.** Bounded only by (a)
  configured depth (`2^depth`; default 20 ≈ 1 M seats, per-Subaccord), (b) rent
  economics (each `JurorStake` ≈ 0.0007 SOL, paid by the juror), (c) indexer
  capacity to hold/serve the tree off-chain.
- **`draw` becomes per-seat (`draw_seat(i)`).** The 1232-byte transaction packet
  cannot hold N Merkle proofs (each ≈ `44 + 40·depth` bytes; depth 20 ≈ 844 B).
  One seat per tx; N txs (3 for v1, up to 31 for the max appeal). Resumable and
  deterministic (any cranker continues; only one valid submission per seat). This
  limit is **pre-existing** — the current one-shot `draw` already cannot fit 31
  proofs in one tx.
- **Every `stake`/`unstake` requires a client-supplied Merkle path.** Indexer
  liveness dependency (a stale path reverts; recompute + retry). Not a correctness
  risk.
- **Capital fully live; no freeze.** ADR-0008's freeze-DoS objection does not
  apply.
- **Retained, unchanged:** the inflation guard (`JurorStake.amount ≥ leaf.stake`,
  a live read — no historical witness needed), the `active_draws` unstake lock,
  the oracle-verified VRF callback (`veridao-crbf`), deterministic sampling
  without replacement (Ugly 1, bean `accord-tzo0`).
- **Dropped:** `last_change_slot` (ADR-0008). It existed only as the witness for
  the `WrongStake`/`Omission` fraud predicates, which this ADR deletes; the
  inflation guard is a live read and never used it. −8 bytes/juror, one fewer field
  set on every `stake`/`unstake`. Crankers track historical tree state themselves
  (stateful indexers, as any court indexer must be).
- **Backward-incompatible.** Pre-deployment; no migration. The SDK MST builder and
  VRF/draw choreography are rewritten to subtree-sum proofs + per-seat draw.

## References

- Supersedes the snapshot layer of ADR-0003, ADR-0008, ADR-0009 (retains
  ADR-0008's inflation guard and ADR-0009's sortition *criterion* in subtree-sum
  form; drops ADR-0008's anchor-slot leaf witness / `last_change_slot`).
- CONCEPT-REVIEW Bad 4, Bad 5.
- Beans: accumulator feature bean; `accord-tzo0` (deterministic sampling + per-seat
  draw on the accumulator root); scraps `accord-9hh7` (Bad 5 subsumed) and
  `accord-gh3k` (re-post-after-void mooted).
