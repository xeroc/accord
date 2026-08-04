---
# veridao-utcu
title: 'Critical: VRF bypass in draw — sortition is caller-chosen, not VRF-bound'
status: in-progress
type: bug
priority: critical
created_at: 2026-08-04T16:10:54Z
updated_at: 2026-08-04T16:49:14Z
parent: veridao-rlno
blocking:
    - veridao-i4jm
---

## Finding

`draw` (programs/accord/src/lib.rs:696-844) accepts `memberships: Vec<JurorMembership>` as a caller-supplied argument and verifies only:

- each leaf against the finalized snapshot root,
- `m.leaf.stake >= sub.min_stake` (the **leaf** value — poster-chosen),
- distinctness (O(N²) pairwise),
- the juror pubkey resolves to a real `JurorStake` PDA.

The VRF result is consumed (`vrf_seed = hash(vrf_result ‖ dispute ‖ round_idx)`, lib.rs:755-763) and emitted in `JurorsDrawn` — but it is **never used to constrain which leaves the caller may submit**. The stake-weighted cumulative lookup is computed off-chain by the cranker; the on-chain program treats the selection as "caller's choice".

## Attack (single actor, sub-$1k cost)

1. Attacker pre-stakes `jurors_per_dispute` sockpuppets → passes the coarse `staker_count` intake gate (lib.rs:421).
2. Front-runs `post_snapshot` with a root over only those sockpuppets (or any root they like — the only on-chain fraud predicate is duplicate-Juror, lib.rs:576-579, which an internally-consistent snapshot never trips).
3. 1-day challenge window passes unchallenged — there is no on-chain completeness predicate, so an honest observer cannot void an omission-only root (false challenge forfeits bond, lib.rs:617-628).
4. `finalize_snapshot` → attacker calls `draw` with cherry-picked memberships of their own jurors. Panel = attacker-controlled, full stop.
5. Commit/reveal/finalize produces whatever ruling the attacker wants. Slash incentives do not bite — all drawn jurors are coherent-by-construction.

The Schelling-point coercion only holds when the juror set is honest-majority; here the attacker *is* the set.

## Why the existing fraud proof does not help

`challenge_snapshot`'s fraud predicate is narrow by design (ADR-0003): it validates *internal consistency* (no duplicate juror across two leaves) because that is the only thing time-independently provable without comparing to live `JurorStake` state (which drifts as jurors stake/unstake during the 1-day window). The predicate does not cover:

- **omission** of legitimate stakers,
- **stale-stake** leaves (juror drained below `min_stake` after snapshot, still drawable),
- **extra-juror** inclusion (juror not in the canonical set).

All three are exploitable today.

## Fix direction (deferred — integration path to be specified)

Integrate a real on-chain VRF and enforce the stake-weighted sortition *on-chain* against a compact snapshot commitment, so the VRF seed deterministically selects the panel and the caller cannot cherry-pick.

Reference: <https://github.com/magicblock-labs/solana-vrf/blob/main/README.md> — integration guide to be loaded when this bean is picked up. Do NOT treat the current emitted-`vrf_seed` as a security control; it is audit-only.

This bean tracks the **VRF enforcement** half of the gap. The complementary **snapshot completeness / honest-minimum** half is a separate design discussion (fraud-proof options) — to be beaned once an approach is chosen.

## Acceptance

- `draw` rejects any `memberships` set that does not correspond to the deterministic VRF-driven sortition over the snapshot.
- Integration reference (magicblock solana-vrf) reviewed and wiring choice documented in an ADR.
- LiteSVM test: attacker-crafted memberships (even when individually valid against the root) are rejected when they don't match the VRF selection.

## Relationships

- Parent: veridao-rlno
- Blocks: veridao-i4jm (snapshot trust hardening — the "richer fraud proof" item #2 there is a strict subset of this)
- Related: veridao-fr1x (Draw — shipped the gap), veridao-rrxs (Snapshot trust — shipped the narrow fraud predicate)

## Implementation Progress (ADR-0008 fraud-proof predicates)

### Shipped (this session)

**Anchor-slot pattern + 3 of 4 fraud predicates:**

- `JurorStake.last_change_slot: u64` — watermark set on every `stake`/`unstake`
- `Snapshot.anchor_slot: u64` — set at `post_snapshot`
- `FraudProof` converted from struct to enum: `Duplicate { .. }` (existing) + `WrongStake { leaf, proof, index }` (new)
- **Predicate 3** (wrong-stake challenge): `challenge_snapshot` dispatches on `FraudProof::WrongStake`, reads `JurorStake` from `remaining_accounts[0]`, verifies `last_change_slot < anchor_slot && amount != leaf.stake`
- **Predicate 4** (inflation guard at draw): `require!(js.amount >= memberships[i].leaf.stake, InflatedStake)` in `draw`
- `AccordError::InflatedStake` added
- All 73 LiteSVM tests green; clippy clean (pre-existing macro warnings only)
- ADR-0008 written (`docs/adr/0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md`)

### Deferred to v1.1 (tracked as child beans — to be created)

All three items below are **blocking the snapshot trust model from being fully
on-chain verifiable**. They compose: MST gives verifiable stake weights, omission
proofs give verifiable completeness, VRF enforcement gives verifiable selection.
Together they close the snapshot-capture attack class documented in this bean.

1. **Merkle-Sum Tree migration** — replace the plain SHA-256 Merkle root with
   an MST where each node commits to `(hash, sum)`. Leaves gain `cum_after: u64`
   (running stake total in pubkey-sorted order). The root commits to
   `total_stake`, making the sortition weights on-chain verifiable. Changes:
   `LeafClaim` format, `verify_merkle_inclusion` → `verify_mst_inclusion`
   (also verifies sum consistency along the proof path), snapshot version flag
   for backward compatibility.

2. **Predicate 2 — Omission via non-inclusion range proof** — requires MST
   leaves sorted by juror pubkey. A challenger proves non-inclusion by
   submitting two adjacent leaves (consecutive indices, both with inclusion
   proofs) bracketing their pubkey, plus their `JurorStake` showing
   `last_change_slot < anchor_slot` and `amount > 0`. Adds a `FraudProof::Omission`
   variant (two leaves + two proofs + witness JurorStake).

3. **VRF enforcement** (this bean's original primary scope) — integrate
   magicblock solana-vrf (<https://github.com/magicblock-labs/solana-vrf/blob/main/README.md>)
   and enforce the stake-weighted sortition on-chain: each drawn membership must
   satisfy `cum_before <= r_i < cum_after` where `r_i` is deterministically
   derived from the VRF seed. The caller can no longer cherry-pick jurors.
   Depends on item 1 (MST) for the cumulative-range check.
