# Subaccord dispute-kit — aggregation as explicit enum; rename jurors_per_dispute → initial_num_jurors

A Subaccord's mechanism configuration **is** the "dispute kit": the tuple of draw
rule, aggregation rule, incentive split, and appeal mode. v1 ships **one** kit.
This ADR locks two changes to the `Subaccord` account so the kit is *config*, not
hardcoded Core logic, and the panel field name says what it means:

1. **Add an explicit `aggregation: Aggregation` enum field** (v1 single variant
   `Plurality`). Aggregation stops being implicit Core logic and becomes a
   per-Subaccord config value. Future variants — `RankedChoice` (IRV) for
   ranked-option disputes (bean `accord-ayqq`) and `Median` for numeric outcomes —
   ship as new enum variants **without touching Core** or any existing dispute.
2. **Rename `jurors_per_dispute` → `initial_num_jurors`** (kept configurable). The
   old name read as a fixed total jury size; the new name communicates that this is
   the **round-1 seed** and that appeals grow the panel via the existing `2N+1`
   rule. A Subaccord may set a larger starting panel for higher-stakes disputes, at
   the cost of fewer appeal rounds that fit under `MAX_JURORS`.

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

**Panel-size field.**

- **Drop the field entirely; hardcode round-1 = 3.** *Considered and rejected in
  this session* — removes per-Subaccord flexibility that Kleros courts have, and
  blocks Subaccords that want a larger starting panel for high-stakes disputes.
- **Keep configurable; rename to `initial_num_jurors` (chosen).** Preserves
  flexibility; the name removes the "fixed total" ambiguity and makes appeal
  growth explicit.
- **Keep the name `jurors_per_dispute`.** Rejected — ambiguous (reads as the whole
  jury, not the seed).

## Consequences

- `Subaccord` renames `jurors_per_dispute` → `initial_num_jurors` (same `u32`) and
  gains `aggregation` (1 byte). Net +1 byte.
- **`create_subaccord` validation (load-bearing):**
  - `initial_num_jurors` must be **odd** (tie avoidance; `2N+1` preserves oddness).
  - The ladder `initial_num_jurors → 2N+1 → …` (one doubling per appeal, up to
    `max_appeals`) must keep the final panel ≤ `MAX_JURORS` (=31):
    `initial_num_jurors · 2^max_appeals + (2^max_appeals − 1) ≤ MAX_JURORS`. With
    the standard `max_appeals = 3` this pins `initial_num_jurors ≤ 3` (→ 31); a
    larger seed requires fewer appeals (e.g. `initial = 7, max_appeals = 2` → 31).
    Reject the combo otherwise.
- The tunable Subaccord economics are now: `min_stake`, `alpha_bps`,
  `fee_per_juror`, `max_appeals`, **and** `initial_num_jurors`. A Subaccord trades
  round-1 accuracy (and cost) against appeal depth. Parameterization stays a
  *static, design-time* author tool — no oracle, no live tuning; "dynamic params"
  remains out-of-scope v2+ per the SPEC.
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

Tracked in the dispute-kit feature bean: add the `Aggregation` enum + field, rename
`jurors_per_dispute` → `initial_num_jurors`, add the `create_subaccord` validation
(odd + ladder-≤-`MAX_JURORS`), default `initial_num_jurors = 3`, update
`create_subaccord` + SDK + SPEC + `EVIDENCE-FORMAT.md` cross-reference, and LiteSVM
tests (aggregation defaults to `Plurality`; `initial_num_jurors` odd + ladder
validation; appeal growth `2N+1` from the seed).
