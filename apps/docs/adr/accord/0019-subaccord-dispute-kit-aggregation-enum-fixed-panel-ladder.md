# Subaccord dispute-kit — aggregation as explicit enum; round-1 panel fixed at 3

A Subaccord's mechanism configuration **is** the "dispute kit": the tuple of draw
rule, aggregation rule, incentive split, and appeal mode. v1 ships **one** kit.
This ADR locks two decisions about the `Subaccord` account so the kit is _config_
where it matters and _constant_ where configurability was illusory:

1. **Add an explicit `aggregation: Aggregation` enum field** (v1 single variant
   `Plurality`). Aggregation stops being implicit Core logic and becomes a
   per-Subaccord config value. Future variants — `RankedChoice` (IRV) for
   ranked-option disputes (bean `accord-ayqq`) and `Median` for numeric outcomes —
   ship as new enum variants **without touching Core** or any existing dispute.
2. **Fix the round-1 panel size at the constant `INITIAL_NUM_JURORS` (=3)** — drop
   the per-Subaccord field entirely. An earlier draft of this ADR proposed renaming
   `jurors_per_dispute → initial_num_jurors` and keeping it configurable; that was
   rejected in review because, at the default `max_appeals = 3`, the ladder
   constraint `(J+1)·2^3 − 1 ≤ MAX_JURORS` pins `J ∈ {1, 3}`. Two options is not
   configurability — it is a footgun with extra validation. The sole per-Subaccord
   panel-shape knob is `max_appeals` (0..=3 ⇒ distinct ladders 3 / 3→7 / 3→7→15 /
   3→7→15→31), which is real config.

Commit-reveal stays **structural** (always on; no per-Subaccord toggle) —
reaffirmed, not changed.

## Considered Options

**Aggregation rule.**

- **Keep plurality implicit in Core (status quo).** Rejected — hardcodes the rule;
  adding IRV/Median later requires a Core upgrade that touches every existing
  dispute's tally path.
- **Explicit `aggregation` enum now, single `Plurality` variant (chosen).** Cheap
  extensibility: the field exists, dispatch is off the enum, new variants are
  additive. No plugin/multi-kit system yet.
- **Full pluggable dispute-kit system (Kleros V2 style — swappable draw,
  aggregation, incentive, appeal per court).** Rejected for v1 — premature
  abstraction before a third variant exists.

**Round-1 panel size.**

- **Rename `jurors_per_dispute → initial_num_jurors`, keep configurable (earlier
  draft).** Rejected — at `max_appeals = 3` the ladder constraint leaves only
  `J ∈ {1, 3}`; the "configurability" is illusory and adds an oddness + ladder
  validation surface (errors, SDK helper, tests) for no real value.
- **Drop the field entirely; hardcode round-1 = 3 as `INITIAL_NUM_JURORS`
  (chosen).** `max_appeals` becomes the single panel-shape knob. Removes the
  validation surface, the `UpdatePayload` variant, and the `CaseTerms` field; the
  ladder `3 → 7 → 15 → 31` always fits `MAX_JURORS` (=31) by construction.
- **Keep the field configurable AND raise `MAX_JURORS`.** Rejected — bigger
  `Round` accounts (rent per dispute) to enable a knob nobody needs in v1.

## Consequences

- `Subaccord` gains `aggregation` (1 byte) and **loses** `jurors_per_dispute`
  (−4 bytes). `CaseTerms` and `CreateSubaccordParams` likewise drop the count.
  `UpdatePayload` loses its `JurorsPerDispute`/`InitialNumJurors` variant — the
  count is no longer mutable (it is a constant).
- **`create_subaccord` panel validation collapses** to the pre-existing
  `max_appeals ≤ MAX_APPEALS`; the oddness + ladder-≤-`MAX_JURORS` checks are gone
  (3 always fits). The tunable Subaccord economics are now: `min_stake`,
  `alpha_bps`, `fee_per_juror`, and `max_appeals`. A Subaccord trades appeal depth
  (and cost) against finality speed. Parameterization stays a _static, design-time_
  author tool — no oracle, no live tuning; "dynamic params" remains out-of-scope
  v2+ per the SPEC.
- `MAX_APPEALS = 3` is locked to `MAX_JURORS = 31` given round-1 = 3
  (`3·2³ + 7 = 31` exactly fills the `Round` account arrays). Raising the appeal
  ceiling requires bigger `Round` accounts — a v2 concern.
- Adding `RankedChoice`/`Median` later = new `Aggregation` variants + matching
  commit/reveal/tally logic + SDK support + an extended evidence-format option
  encoding (a future `accord-evidence/v2` schema, see `EVIDENCE-FORMAT.md` §9). No
  change to existing disputes or to Core's dispute state machine.
- The option-encoding in the evidence manifest (`EVIDENCE-FORMAT.md` §4) is
  plurality-shaped for `accord-evidence/v1`; that schema is unchanged by this ADR.
- Supersedes nothing. Complements ADR-0003 (draw), ADR-0009 (sortition), ADR-0005
  (mutable params), ADR-0002 (staking token). Does **not** touch the flat-slash /
  1-juror-1-vote model (ADR-0003 consequence).

## Implementation

Tracked in the dispute-kit feature bean (`accord-8m2a`): add the `Aggregation`
enum + field, drop `jurors_per_dispute` from `Subaccord`/`CaseTerms`/
`CreateSubaccordParams`/`UpdatePayload`, introduce the `INITIAL_NUM_JURORS = 3`
constant, simplify `create_subaccord` to the `max_appeals`-only validation, make
`panel_size_for_round(round_idx)` single-arg over the fixed ladder, update the SDK

- SPEC + security-checklist, and LiteSVM tests (aggregation stored as `Plurality`;
  `max_appeals` ceiling rejection; each `max_appeals` 0..=3 accepted).
