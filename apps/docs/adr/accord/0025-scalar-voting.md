# Scalar voting — u64 votes, Median aggregation, bps coherence band

> **Status:** Accepted / Implemented (bean `accord-h5nx`; shipped in
> `programs/accord/src/state.rs`, `lib.rs`, `utils.rs`,
> `instructions/{reveal,finalize_round,create_dispute,create_subaccord}.rs`,
> and `programs/canon/src/instructions/settle_item.rs`).

A ruling used to be a `u8` option index — a point in a filer-enumerated option
list. It is now a **`u64` scalar**: jurors reveal fixed-point values, a new
`Aggregation::Median` variant tallies them by median, and coherence — the
slash/reward line — becomes a **basis-point band around the final median**
instead of exact equality. `Plurality` disputes keep byte-for-byte their current
semantics; they simply ride the widened `u64` representation.

## Context

The Schelling-point design (ADR-0001) assumes jurors converge on one
identifiable answer. For categorical disputes ("keep or remove?", "pay or
deny?") a shared option index expresses that. But the flagship arbitration
case — a **settlement amount**, "how much should the claimant be paid?" — is
scalar: honest jurors give *nearby* numbers, not the *same* number, and a `u8`
option index cannot express "how much" at all.

ADR-0019 added the `Aggregation` enum with a single `Plurality` variant and
explicitly deferred `Median` ("for numeric outcomes") as a future variant.
Shipping it collides with the existing incentive design in one place: coherence
is exact-match (`vote == final_ruling`). Exact match is correct for option
indices and fatal for estimates — a juror one base unit off the median would be
slashed. Scalar voting therefore lands as three coupled changes: a wider vote
type, a median tally, and coherence as a tolerance band.

## Decision

1. **Votes, results, and rulings widen `u8 → u64`.** `reveal(vote: u64, salt)`
   (`lib.rs`), `Round.result` and `Round.reveals`, `Dispute.final_ruling`,
   `AppealBond.prior_result`, the `Revealed`/`RoundResolved` events, and canon's
   `ItemSettled.ruling` all carry `u64`. The **`u64::MAX` sentinel** replaces
   `Option<u64>` (which is not `Pod` and would break `Round`'s `zero_copy`
   mapping) for "no value". `Dispute::ruling() -> Option<u64>`
   (`state == Final && final_ruling != u64::MAX`) is the single read contract —
   the `get_ruling` CPI returns it directly, so Arbitrables see `None` until
   finality and never the sentinel.

2. **Scale is applied OFF-chain — the chain is scale-agnostic.** A juror on a
   6-decimal USDC pool encodes `123.45` as `123_450_000` base units client-side;
   the program stores and compares raw integers. It never holds a decimals
   factor and never multiplies by one, so the same code serves 2-decimal and
   8-decimal mints. (Display formatting remains the client's job, exactly as it
   already was for token amounts.)

3. **`Aggregation::Median` files with zero options.** `create_dispute` gates on
   the kit: `Plurality` keeps `2..=MAX_OPTIONS` option hashes; `Median`
   requires `n == 0` — the vote is a value, not an index (`create_dispute.rs`).
   The tally (`finalize_round.rs`) collects the non-sentinel reveals,
   `sort_unstable()`s them ascending, and takes `vs[n/2]`. Panels are odd by
   construction (`(J+1)·2^k − 1`), but non-revealers can leave an **even**
   reveal count — then `n/2` is the **upper-middle** element: deterministic,
   biased high by at most one sort position, and moot on a fully-revealed odd
   panel. The ADR-0021 quorum gate guarantees `n ≥ 1` for any non-zero
   `reveal_threshold_bps`.

4. **Coherence becomes a band: `coherence_tol_bps: u16`**, a new field on
   `Subaccord` and `CreateSubaccordParams`, **frozen onto `CaseTerms` at
   filing** (the ADR-0019/0022 kit-config family, Ugly-6 freeze). A revealed
   vote is coherent iff

   `|vote − final_ruling| · 10_000 ≤ final_ruling · coherence_tol_bps`

   computed in `u128` so `ruling · bps` cannot overflow (`utils.rs`,
   `settle_round_accounts`). Default `DEFAULT_COHERENCE_TOL_BPS = 100` (±1%);
   `0` = exact match; validated `≤ 10_000` (±100%) at `create_subaccord`. It is
   **inert for `Plurality`**, whose coherence stays exact option equality. It is
   **immutable** — absent from `UpdatePayload` — because it defines the pool's
   coherence game, like `aggregation` itself.

5. **Commit preimage widens: `hash(vote_le8 ‖ salt ‖ juror)`.** The vote enters
   the commitment hash as its 8-byte little-endian encoding — a 72-byte
   preimage (was 1 byte of option index). `commit` still takes only the 32-byte
   commitment (hashing stays client-side); `reveal` recomputes `hashv` over the
   three fields and matches (`reveal.rs`).

6. **`Round` is re-laid out** (zero_copy, width-grouped for `Pod`; tightened
   to a single 2-byte pad by the follow-up layout cleanup): u32 block
   (`round_idx`, `juror_count`, `commit_count`, `reveal_count`, `draw_attempt`)
   → the u8 scalars (`settled`, `bump`) + 2-byte pad fill the 20→24 alignment
   hole → i64 window deadlines (`review_end`/`commit_end`/`reveal_end`) and
   `result: u64` at struct offset 48 →
   `dispute`/`jurors`/`commits` → `seat_prefix`/`seat_stake`/`reveals` u64
   arrays, with `reveals` at struct offset **2568** (2576 including the 8-byte
   discriminator; total struct 2816 bytes). `AppealBond` likewise carries
   `prior_result: u64` (offset consts in `constants.rs::layout`).

|                       | `Plurality`                          | `Median`                                  |
| --------------------- | ------------------------------------ | ----------------------------------------- |
| filing                | `2..=MAX_OPTIONS` option hashes      | zero options                              |
| valid reveal          | `vote < num_options`                 | any `u64` except `u64::MAX`               |
| tally                 | highest count (option index)         | middle of sorted reveals (upper if even)  |
| coherence             | `vote == final_ruling`               | `abs(vote − ruling)·10_000 ≤ ruling·tol_bps` |
| `final_ruling` means  | winning option index                 | final median (settlement-mint base units) |

## Considered Options

**Vote representation.**

- **Floating-point (`f64`).** Rejected — floats are the wrong consensus
  datatype: no exact cross-client equality between encode, hash, and compare,
  rounding drift between juror SDKs, and no `Pod`-friendly determinism story.
  Integer fixed-point is exact, hashable, and Borsh-trivial.
- **`u64` fixed-point, scaled off-chain (chosen).** One representation for both
  kits; scale lives with the client that already formats the amounts.

**Coherence tolerance shape.**

- **Per-dispute absolute tolerance ("within N base units").** Rejected —
  magnitude-coupled: the same `N` is strict for a 100 USDC dispute and vacuous
  for a 10M USDC one, so every filer would have to pick a scale-aware `N` per
  case, and mid-dispute the band's meaning still floats with the ruling.
- **bps-of-ruling band (chosen).** Scale-free — 100 bps is ±1% whatever the
  mint's decimals or the amount; one pool-wide knob frozen at filing; `0`
  recovers exact match; `10_000` caps at ±100%.

**Scalar mechanism.**

- **Bucketed plurality** (pre-round the amount into K buckets, vote a bucket
  index). Rejected — weak Schelling point: honest jurors scatter across
  neighboring buckets, and exact-match coherence slashes the juror one bucket
  off the winner. The median *is* the Schelling point for scalar estimates.
- **Median over revealed values (chosen).** Robust to outliers (an outlier is
  slashed, not rewarded with tally weight), deterministic, one comparison per
  element.

**Where the decimals factor lives.**

- **Stored on-chain (a `decimals: u8` on the Subaccord).** Rejected — the chain
  never multiplies by the scale; the field would be display-only, carrying
  validation and IDL weight with no on-chain consumer.
- **Off-chain (chosen).** The program is scale-agnostic by construction.

## Consequences

- **Breaking IDL + account-layout change; no migration.** The program is
  pre-deployment (greenfield, per ADR-0022's precedent), so the widened
  `reveal` arg, `Round`/`AppealBond` re-layout, and event types ship as an IDL
  regen consumed by SDK, CLI, cranker, and app in the same bean (`accord-h5nx`).
- **`Plurality` semantics are unchanged.** Same filing gate, same
  `vote < num_options` bound (now carried in `u64`), same plurality tally,
  exact-match coherence (the band is inert). Canon — the one in-tree
  Arbitrable — is unaffected beyond u64 plumbing: it only files `Plurality`,
  `settle_item` still bounds the ruling with `ruling < 2`, and its
  `create_list` CPI passes `coherence_tol_bps: 0`.
- **Appeals: flip = exact median change.** Bond flip detection stays
  `final_ruling != prior_result` (`AppealBond`). For `Median` that is an
  exact-value test: an appeal that moves the median by a single base unit flips
  the bond even though both medians sit inside each other's coherence band.
  Coherence (the reward game) and flip (the bond game) are deliberately
  different tests — voting "coherently" is not enough to predict the bond.
- **Coherence judges against the FINAL ruling, not the round's own median**
  (`settle_round_accounts` judges every round against `final_ruling`), same
  rule as `Plurality`. A round overturned on appeal slashes its jurors unless
  their votes were also within `tol_bps` of the final median; the existing
  zero-coherent → revealers-split fallback (bean `accord-aqmw`) still applies.
- **`u64::MAX` is not a votable value** on the `Median` path (the `reveal`
  gate) — the sentinel owns it. A pool whose honest answer could be `2^64 − 1`
  base units is out of scope; realistic settlement amounts are far below.
- **Zero-options filing** removes the option-label surface for `Median`
  disputes: ADR-0017's salted option list is plurality-shaped and simply unused
  there — the option space is the whole non-negative fixed-point range.
- **Even-reveal upper-middle is deliberate.** Determinism is the requirement;
  the bias is bounded by one sort position and vanishes on fully-revealed
  (odd) panels.
- Amends **ADR-0019** (ships the `Median` variant it deferred as future work;
  `Plurality` remains the v1 default kit). Supersedes nothing. Layout-sibling
  of ADR-0020/0021/0022 (all touch the same `Subaccord`/`CaseTerms`/`Round`
  structs).

## Implementation

Tracked in bean `accord-h5nx` (milestone: program + SDK + CLI + cranker + app +
docs). Program: `state.rs` (`Aggregation::Median`, `coherence_tol_bps` on
`Subaccord`/`CaseTerms`/`CreateSubaccordParams`, `Dispute::ruling()`, the
`Round`/`AppealBond` re-layout); `reveal` (aggregation-gated vote check +
8-byte LE preimage verify); `commit` (signature unchanged — hashing is
client-side); `finalize_round` (median tally arm); `settle_round_accounts`
(band judge, `u128` math); `create_dispute` (zero-options gate);
`create_subaccord` (`coherence_tol_bps ≤ 10_000`); `get_ruling → Option<u64>`;
canon `settle_item`/`create_list`. LiteSVM TDD:
`scalar_median_full_lifecycle` (3-vote median, band ±1%, no slashes),
`scalar_median_slashes_outlier` (5× outlier slashed, coherent pair splits),
`scalar_vote_sentinel_and_plurality_range_rejected`; borsh-offset layout
asserts for the re-laid-out accounts.
