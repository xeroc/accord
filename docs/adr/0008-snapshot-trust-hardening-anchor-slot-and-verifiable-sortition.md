# Snapshot trust hardening — anchor-slot pattern, four-predicate fraud surface, and verifiable stake-weighted sortition

## Status

**Proposed.** Augments ADR-0003 (which established the Merkle-rooted snapshot + 1-day
fraud-proof window + off-chain sortition as the draw's trust anchor). Does not supersede
ADR-0003's draw architecture; hardens the trust model it depends on. Tracks critical
finding bean `veridao-utcu` (VRF bypass) and hardening bean `veridao-i4jm`.

## Context

ADR-0003's fraud predicate is deliberately narrow: only **duplicate-juror** fraud (two
leaves with the same juror pubkey, both verifying against the root) is on-chain
verifiable. This was a v1 scoping decision — duplicate detection is the one predicate
that is time-independently provable without comparing the snapshot to live `JurorStake`
state, which drifts as jurors stake/unstake.

Three attack classes are left open:

1. **Omission.** A poster silently excludes honest jurors from the snapshot. The root is
   internally consistent (no duplicates), so the 1-day challenge window cannot void it.
   An honest observer who attempts to challenge forfeits their bond (false challenge,
   `lib.rs:617-628`).

2. **Wrong-stake inflation.** A leaf overstates a colluding juror's stake to increase
   their sortition weight (probability of being drawn). The leaf's `stake` field is
   poster-chosen; the chain checks `m.leaf.stake >= sub.min_stake` (`lib.rs:734-736`)
   but never compares the leaf's stake to the juror's actual `JurorStake.amount`.

3. **Wrong-stake deflation.** A leaf understates an honest juror's stake to suppress
   their draw probability.

Combined with the VRF enforcement gap (bean `veridao-utcu`: the VRF seed is emitted for
audit at `lib.rs:755-763` but never constrains which `memberships` the draw caller may
submit), these allow a single actor to capture any dispute at a cost of ~1 dispute fee:

1. Pre-stake `jurors_per_dispute` sockpuppets (passes the coarse `staker_count` intake
   gate, `lib.rs:421-424`).
2. Front-run `post_snapshot` with a root over only those sockpuppets.
3. Wait 1 day — no valid challenge exists for an internally-consistent root.
4. Call `draw` with cherry-picked memberships.

The Schelling-point coercion only holds when the juror set is honest-majority. In this
attack, the attacker _is_ the set.

## Decision

### 1. Anchor-slot pattern

The snapshot is a **point-in-time freeze** of the juror set. All correctness checks
compare against state as of the snapshot's anchor slot, not the current chain state.
State changes after the anchor are irrelevant to any pending snapshot — they simply
produce a different snapshot the next time one is posted.

**State additions:**

```rust
pub struct JurorStake {
    // ...existing fields (subaccord, juror, amount, active_draws, bump)...
    pub last_change_slot: u64,   // set to Clock::get()?.slot on every stake / unstake
}

pub struct Snapshot {
    // ...existing fields (dispute, round_idx, merkle_root, poster, bond, ...)...
    pub anchor_slot: u64,        // set to Clock::get()?.slot at post_snapshot
}
```

`stake` and `unstake` write `last_change_slot = Clock::get()?.slot`. `post_snapshot`
writes `anchor_slot = Clock::get()?.slot`. Capital mobility is fully live — no freezing,
no rate limiting.

**Foundational property:** if `JurorStake.last_change_slot < Snapshot.anchor_slot` AND
`JurorStake.amount > 0`, then the juror was staked with exactly `amount` tokens at the
anchor slot. The witness is the live `JurorStake` account itself — no historical state
required.

**Why this works without stake history:** Solana account state is mutable in place, but
`last_change_slot` is a monotonically-increasing watermark recording _when_ the state
last changed. If the watermark predates the anchor, the current state _is_ the
anchor-time state. The account serves as its own historical witness.

### 2. Four-predicate fraud surface

| #   | Fraud class                | Predicate                                                                    | Enforced at      | Witness                                       |
| --- | -------------------------- | ---------------------------------------------------------------------------- | ---------------- | --------------------------------------------- |
| 1   | Duplicate juror            | Two leaves, same `juror` pubkey, both verify against root                    | Challenge window | Two inclusion proofs                          |
| 2   | Omission                   | `last_change_slot < anchor_slot` AND `amount > 0` AND juror absent from root | Challenge window | Live `JurorStake` + non-inclusion range proof |
| 3   | Wrong-stake (honest juror) | `last_change_slot < anchor_slot` AND `amount ≠ leaf.stake`                   | Challenge window | Live `JurorStake` + inclusion proof           |
| 4   | Wrong-stake (drawn juror)  | `JurorStake.amount < leaf.stake`                                             | **Draw time**    | Live `JurorStake` (already loaded)            |

#### Predicate 1 — Duplicate juror (existing)

A challenger submits two leaves at different indices (`index_a ≠ index_b`), both with
the same `juror` field, both verifying against the snapshot root via their respective
Merkle proofs. Time-independent: no comparison to live state.

This is the existing `challenge_snapshot` predicate (`lib.rs:576-579`). Unchanged.

#### Predicate 2 — Omission (new)

The snapshot leaves are **sorted by juror pubkey**. A challenger proves a legitimate
juror was omitted by submitting a non-inclusion range proof:

- Two adjacent leaves `leaf[i]` and `leaf[i+1]` (consecutive indices, both with
  inclusion proofs against the root) such that
  `leaf[i].juror < challenger_pubkey < leaf[i+1].juror`.
- The challenger's `JurorStake` account, showing `last_change_slot < anchor_slot` and
  `amount > 0`.

The chain verifies:

1. Both leaves verify against the root (Merkle proofs).
2. `i + 1 == i + 1` (consecutive indices — no leaf exists between them in sorted order).
3. `leaf[i].juror < challenger_pubkey < leaf[i+1].juror` (the challenger falls in the
   gap).
4. `JurorStake.last_change_slot < Snapshot.anchor_slot` (the challenger was staked
   before the freeze).
5. `JurorStake.amount > 0` (the challenger had real stake).

All five conditions hold → the snapshot omitted a juror who was provably staked at the
anchor → **fraud → void** (poster's bond + challenger's bond sweep to challenger).

**Edge cases:** if the challenger's pubkey is smaller than `leaf[0]`, the non-inclusion
proof is a single boundary leaf at index 0 (`challenger_pubkey < leaf[0].juror`). If
larger than `leaf[N-1]`, a single leaf at the last index
(`challenger_pubkey > leaf[N-1].juror`).

#### Predicate 3 — Wrong-stake, honest juror (new, challenge window)

A challenger submits an inclusion proof for a leaf whose `stake` field differs from the
juror's actual anchor-time stake. The `JurorStake` account is the witness:

```
last_change_slot < anchor_slot          → live amount = anchor-time amount
leaf.stake ≠ JurorStake.amount          → the leaf misrepresents the stake
```

The chain verifies the inclusion proof, then reads the juror's `JurorStake` (passed as
a remaining account) and checks both conditions.

If `leaf.stake < amount` → **deflation** (the poster suppressed the juror's weight).
If `leaf.stake > amount` → **inflation** (caught here too, but primarily enforced at
draw time by predicate 4). Either direction is fraud → **void**.

#### Predicate 4 — Wrong-stake, drawn juror (new, draw time)

At `draw`, the chain already deserializes each drawn juror's `JurorStake` to increment
`active_draws` (`lib.rs:785-793`). Add one require:

```rust
require!(js.amount >= m.leaf.stake, AccordError::InflatedStake);
```

The leaf may understate or match the live amount, never overstate. This catches
inflation **regardless of the TOCTOU race** (see section 3 below) because it reads the
current live state, not the anchor-time state. An inflated leaf either:

- Gets rejected at draw (live amount < leaf.stake → the juror can't be drawn), or
- Is matched by real capital (the attacker deposits the difference → honest outcome).

### 3. The TOCTOU race and why it is toothless

A time-of-check-to-time-of-use race exists: after `post_snapshot` sets `anchor_slot`, a
juror can change their stake, setting `last_change_slot > anchor_slot`. This breaks
predicates 2 and 3 (both require `last_change_slot < anchor_slot` as the witness
condition).

The race is only exploitable by the **account owner** — the juror who signs
`stake`/`unstake`. Consider the two adversaries separately:

**Inflation (attacker's colluding juror).** The attacker posts a leaf claiming Bob has
10,000 stake; Bob really has 1,000. The attacker (who controls Bob's key) races a stake
change to set `last_change_slot > anchor_slot`, breaking the challenge witness. But
predicate 4 catches inflation at draw time regardless: `JurorStake.amount < leaf.stake`
→ the membership is rejected. The attacker's only escape is to deposit 10,000 real
tokens — which is the honest outcome, not fraud.

**Deflation (honest juror's leaf).** The attacker posts a leaf claiming Alice has 100
stake; Alice really has 1,000. The attacker **cannot** change Alice's stake — only Alice
signs her stake/unstake. Alice's witness (`last_change_slot < anchor_slot`,
`amount = 1,000 ≠ leaf.stake = 100`) is unbreakable by the attacker. Alice (or any
bounty hunter) challenges and voids the snapshot during the 1-day window.

The race is **asymmetric**: it helps only the attacker's own accounts, and those are
caught at draw time. It cannot break the challenge for honest accounts. No freeze is
needed.

### 4. Stake-weighted verifiable sortition

The fraud predicates above ensure the snapshot faithfully represents the juror set and
their stakes as of the anchor slot. The sortition mechanism determines how those stakes
translate into draw probability.

#### Snapshot leaf format — Merkle-Sum Tree (MST)

v1 uses a plain SHA-256 Merkle root (as shipped in ADR-0003). The target design upgrades
to a **Merkle-Sum Tree** where each node commits to both a hash and a stake sum:

```
Leaf (sorted by juror pubkey):
  { juror: Pubkey, stake: u64, cum_after: u64 }
  where cum_after = stake_0 + stake_1 + ... + stake_i (running sum)

Internal node:
  { hash: [u8; 32], sum: u64 }
  where sum = sum of all leaf stakes in this subtree

Root:
  { hash: [u8; 32], sum: u64 = total_staked }
```

Each Merkle proof includes sibling hashes **and sibling sums**, allowing the chain to
verify that:

- The leaf is structurally part of the tree (hash verification).
- The cumulative stakes are internally consistent (sum verification along the path).
- The root's `sum` equals the true total staked.

#### Selection algorithm

Given a finalized snapshot root `(root_hash, total_stake)` and a VRF result:

1. **Derive the VRF seed:**
   `vrf_seed = hash(vrf_result ‖ dispute.key() ‖ round_idx)`

2. **Derive N random values, one per panel slot:**
   For `i` in `0..panel_size`:
   `r_i = hash(vrf_seed ‖ i) mod total_stake`
   This produces a uniform random number in `[0, total_stake)`.

3. **Binary search (off-chain):**
   For each `r_i`, find the juror whose cumulative range contains `r_i`:
   `cum_before ≤ r_i < cum_after`
   where `cum_before = cum_after - stake`.
   This is O(log N) per slot.

4. **Rejection sampling for distinctness:**
   If the selected juror was already drawn in a previous slot, re-roll:
   `r_i = hash(vrf_seed ‖ i ‖ nonce)`, increment `nonce`, re-search.
   Repeat until a new distinct juror is found. The expected number of re-rolls is small
   when `panel_size ≪ pool_size` (for N=3 and pool=100, P(collision) ≈ 3% per slot).

5. **Submit to chain:**
   The cranker submits N tuples: `{leaf, merkle_proof, r_i}`.

#### On-chain verification (at `draw`)

For each submitted membership:

| Check                                                                   | What it verifies                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| MST proof against root                                                  | Leaf is genuinely in the tree; sums are consistent                     |
| `cum_before ≤ r_i < cum_after`                                          | The VRF-derived random value falls in this juror's cumulative range    |
| `r_i == hash(vrf_seed ‖ i) mod total_stake` (or `‖ nonce` for re-rolls) | The random value was correctly derived from the VRF, not cherry-picked |
| `JurorStake.amount >= leaf.stake`                                       | Inflation guard (predicate 4)                                          |
| `JurorStake.last_change_slot`                                           | Optional: verify the juror existed at anchor                           |
| Distinctness (O(N²) pairwise, N ≤ 31)                                   | No juror drawn twice                                                   |

**Probabilistic guarantee.** The probability of drawing juror `J_i` in a single slot is:

```
P(J_i drawn in one slot) = stake_i / total_stake
```

This is stake-proportional by construction: a juror with 10× the stake has 10× the
per-slot draw probability. The VRF ensures the selection is unbiasable and unpredictable
before the snapshot is finalized.

**Schelling-point safety bound.** Under the honest-majority assumption (honest stake
fraction `p`), the probability of an honest majority in a panel of `N` is a binomial
sum:

```
P(honest ≥ ⌈N/2⌉) = Σ_{k=⌈N/2⌉}^{N} C(N,k) · p^k · (1-p)^(N-k)
```

| Honest stake (`p`) | Panel (`N`) | P(honest majority) | P(2/3 supermajority) |
| ------------------ | ----------- | ------------------ | -------------------- |
| 60%                | 3           | 64.8%              | 28.8%                |
| 60%                | 7           | 71.0%              | 41.7%                |
| 60%                | 15          | 78.9%              | 56.6%                |
| 70%                | 3           | 78.4%              | 65.2%                |
| 70%                | 7           | 87.4%              | 82.4%                |
| 70%                | 15          | 95.0%              | 94.2%                |
| 80%                | 3           | 89.6%              | 81.9%                |
| 80%                | 7           | 96.6%              | 95.3%                |
| 80%                | 15          | 99.6%              | 99.2%                |

These bounds assume: (a) the VRF is unbiased, (b) the snapshot faithfully represents the
stake distribution (guaranteed by the four predicates), and (c) honest jurors vote
truthfully (the Schelling equilibrium). The fraud proofs cannot guarantee (c) — they
make it rational by ensuring honest jurors are present and their stake weight is
represented correctly.

## Considered Options

### Freeze stake/unstake during the snapshot window (rejected)

Block `stake`/`unstake` on a Subaccord while any snapshot is in `Posted` or `Finalized`
state. ~5 lines of code.

**Rejected because:** an attacker files a dispute + posts a snapshot for ~1 dispute fee
and freezes all capital movement on the entire Subaccord for 1+ days. Rinse and repeat
→ indefinite lockout. A product whose value proposition is "stake capital to earn fees"
cannot ship with a freeze button that costs one dispute fee to press. Rate limiting
bounds but does not eliminate the freeze; even one snapshot per week means a week-long
freeze per dispute volume.

### Per-juror stake history ring buffer (deferred to v1.1)

Each `JurorStake` keeps a ring buffer of `(slot, amount)` entries (~8 × 16 bytes =
128 bytes/juror). A challenger reads the entry closest to (but before) `anchor_slot` to
recover the anchor-time stake, even if the juror has since changed their stake.

**Deferred because:** the anchor-slot pattern + draw-time inflation check already close
all four predicates without history. The ring buffer would additionally close the
narrow case where a juror coincidentally changes their own stake during the challenge
window, losing their own challenge ability for that snapshot. This is a liveness gap in
the fraud mechanism, not a correctness gap — the sortition remains correct because
predicate 4 catches inflated leaves regardless.

### Epoch-based registry snapshots (noted for v2)

A permissionless crank periodically snapshots the full staker set into a `StakerEpoch`
account (every `EPOCH_SLOTS`). Disputes reference an epoch, not live state. This is the
Cosmos / Ethereum validator-set pattern.

**Not chosen for v1 because:** adds a crank, epoch accounts, and `EPOCH_SLOTS` latency
between staking and being drawable. The anchor-slot pattern achieves the same decoupling
(snapshot is authoritative for its anchor slot) without the epoch machinery. Revisit for
v2 if the Subaccord needs canonical epoch boundaries for reward distribution or slashing
coordination.

## Consequences

- **No freeze, ever.** Capital is fully live. `stake`/`unstake` is never blocked by a
  pending snapshot. The anchor-slot pattern decouples snapshot validity from live state
  changes without restricting capital mobility.

- **No historical state required for v1.** The `last_change_slot` watermark makes the
  live `JurorStake` its own anchor-time witness. No ring buffer, no epoch accounts. One
  new `u64` field per `JurorStake` (+8 bytes rent), one new `u64` per `Snapshot`.

- **Four verifiable fraud predicates.** Duplicate (existing), omission (range proof +
  watermark), wrong-stake deflation (inclusion proof + watermark), wrong-stake inflation
  (draw-time live check). Three enforced during the challenge window, one at draw time.

- **TOCTOU-resilient by construction.** The race is asymmetric: it helps only
  attacker-controlled accounts (caught at draw), not honest accounts (unbreakable
  witness because the attacker doesn't control the honest juror's signing key).

- **Stake-weighted sortition is on-chain verifiable.** The Merkle-Sum Tree + VRF mod
  `total_stake` + cumulative-range check makes the selection criterion provable. The
  cranker cannot cherry-pick — each membership must satisfy `cum_before ≤ r_i <
cum_after` where `r_i` is VRF-derived.

- **Honest-majority assumption is explicit.** The fraud proofs guarantee the snapshot is
  faithful; they do not guarantee the juror set is honest. Schelling-point safety is a
  function of `p` (honest stake fraction), `N` (panel size), and the VRF's
  unbiasedness. The binomial table quantifies the trade-off. There is no fraud proof
  that proves honesty — it is an economic assumption, surfaced explicitly.

- **MST migration cost.** v1 uses a plain SHA-256 Merkle root. Upgrading to the MST
  (cumulative stakes in leaves, sum commitments in nodes) changes the leaf format and
  the verification path. Backward-incompatible; will require a snapshot version flag or
  a fresh Subaccord.

- **Off-chain indexer still required.** The poster computes the snapshot tree and the
  cranker performs the binary search. The chain verifies, but does not compute. This is
  the fundamental trade-off of scaling to an unbounded juror pool within Solana's
  account/compute budget (ADR-0003).

- **Appeal amplifies safety.** Each appeal doubles+1 the panel (3 → 7 → 15 → 31). For
  any honest-stake fraction `p > 50%`, P(honest majority) increases monotonically with
  panel size. The appeal mechanism is therefore a Schelling-point safety amplifier, not
  just a dispute-resolution retry.

## References

- ADR-0003 — original draw architecture (Merkle snapshot, VRF, distinct jurors)
- Bean `veridao-utcu` — critical VRF bypass finding (this ADR's sortition enforcement
  section is the design response)
- Bean `veridao-i4jm` — snapshot trust hardening (items #1 re-post-after-void and #2
  richer fraud proof; this ADR supersedes item #2)
- Bean `veridao-rrxs` — shipped the original snapshot trust lifecycle
- Bean `veridao-fr1x` — shipped the original draw instruction
- VRF integration reference: <https://github.com/magicblock-labs/solana-vrf/blob/main/README.md>

## Addendum: commit_vrf / draw retry rationale (ADR-0009 design)

The sortition enforcement in ADR-0009 requires the VRF result to be **committed
once and immutable across retries**. A single `draw(vrf_result, ...)` instruction
that both stores the VRF and checks the selection has a revert problem: if the
draw fails (collision between VRF-selected jurors), the entire transaction
reverts — including the VRF commitment write. The retry starts with no committed
VRF; the caller could pass a different `vrf_result`, brute-forcing VRF results
until one selects favorable jurors.

**Fix**: split into two transactions. `commit_vrf(vrf_result)` writes
`dispute.committed_vrf` in a standalone tx that always succeeds. `draw(draw_attempt,
memberships)` reads the committed VRF — it cannot be swapped. Failed draws
revert the Round init but the VRF commitment persists on the Dispute account. The
cranker retries with incremented `draw_attempt`, which mixes into the VRF seed to
produce different `r_i` values without a new oracle call.

This is why the VRF commit must be separate from the draw execution: Solana's
transaction atomicity means a failed instruction reverts all writes in the tx.
The commit must survive the draw failure, which requires a separate tx.
