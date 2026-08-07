# Reveal quorum + shortfall redraw — `draw_attempt` orthogonal to `round_idx`

A round's plurality result is only **authoritative** if enough drawn jurors revealed. Below a
configurable reveal-fraction **threshold** (kit config, frozen into `CaseTerms` at filing), the
round does not finalize; instead a permissionless **redraw** reconvenes the same-size panel with
fresh seats, slashing the no-shows. After `max_draw_attempts` shortfalls the dispute transitions to
**`Failed`** — fees and bonds refunded, but the no-shows are still slashed.

Three decisions, resolved in the 2026-08-07 grilling:

1. **Fixed reveal-fraction threshold, fail-shortfall.** Require a configurable fraction of the
   drawn panel to reveal for the result to be authoritative. The absolute commitment escalates per
   appeal for free (2/3 of 3 = 2, of 7 = 5, of 15 = 10) via panel growth, without a
   separately-rising fraction (which would bias against the appeals that exist to correct errors).
   This kills the zero-mandate rulings that `finalize_round` currently produces by `max_by_key`
   tie-break (CONCEPT-REVIEW §4.9) and matches the review's fail-closed recommendation.
2. **Shortfall → redraw (slash no-shows, same size), via an orthogonal `draw_attempt`.** A
   shortfall does **not** advance `round_idx` (which would grow the panel, consume an appeal, and
   need a bigger fee — silently turning into an appeal). Instead a separate `draw_attempt` counter
   salts the sortition seed for fresh seats at the same panel size. No-shows are slashed into
   `stake_delta` (pending, not `staked`), so the inflation guard still passes and no dead zones
   form; lazy `reconcile_stake` + the existing free-stake gate naturally bleed and exclude repeat
   offenders.
3. **Participation fee conditional on threshold.** Failed rounds pay nothing, so the filer's single
   round deposit is never drained by no-shows and suffices across the whole redraw ladder; on
   `Failed` the intact pool refunds cleanly.

## `round_idx` vs `draw_attempt` — explicit distinction

Both salt the seed `hash(committed_vrf ‖ dispute ‖ round_idx ‖ draw_attempt ‖ seat ‖ retry)`. They
are orthogonal:

|                     | `round_idx` (appeal)                       | `draw_attempt` (redraw)       |
| ------------------- | ------------------------------------------ | ----------------------------- |
| increments on       | genuine appeal                             | shortfall (threshold not met) |
| panel size          | grows `(J+1)·2^k − 1`                      | unchanged                     |
| consumes            | `max_appeals` budget                       | `max_draw_attempts` budget    |
| costs               | appeal bond + new-round fee (appellant)    | no bond; slash to no-shows    |
| exhaustion terminal | final ruling stands (can't appeal further) | dispute `Failed` (no ruling)  |

`(0,0)` = initial draw; `(k,0)` = appeal k's first panel; `(k, n>0)` = shortfall redraw n within
round k. `round_idx` is the only thing that grows the panel or consumes the appeal budget;
`draw_attempt` changes only the seed.

## Considered Options

**Quorum mechanism.**

- **No quorum; finalize on tie-break (status quo).** Rejected — produces zero-mandate rulings;
  unsafe for any consumer that enacts on a ruling (§4.9).
- **Fixed reveal fraction, fail-shortfall (chosen).** Kills zero-mandate; escalating absolute
  commitment for free.
- **Escalating reveal fraction per appeal.** Rejected — makes correction harder exactly when
  appeals exist to correct; double-charges meritorious appeals already priced by the bond.
- **Auto-retry to a bigger panel on shortfall.** Rejected as the default — turns abstention
  griefing into resource exhaustion and reopens the bigger-panel funding question; the same-size
  redraw is cheaper and preserves appeals.

**Shortfall slash timing.**

- **Defer all slashes to settlement.** Rejected — under a sustained strategic block
  (> 1 − threshold stake) the dispute never settles, so the attacker is never bled and the veto is
  free until cancel.
- **Slash per-redraw into `stake_delta` (chosen).** Bleeds no-shows each round; because the slash is
  pending (not `staked`), the frozen-root inflation guard still passes → no dead zones, no
  re-freeze, no root recompute during the draw. Lazy `reconcile_stake` then drops `staked` until
  the free-stake gate (`free_stake >= min_stake + slash_per_juror`) excludes repeat offenders from
  later redraws.

**Terminal on `max_draw_attempts`.**

- **Fail-closed `Failed` + refund fees/bonds + slashes stand (chosen).** Safe: a >threshold holder
  can force `Failed` but cannot force a wrong ruling; they pay `α · min_stake × seats × attempts`
  for the privilege; the filer is refunded and may re-file.
- **Escalate to appeal-shape on exhaustion.** Rejected — reintroduces the bigger-panel funding
  question exactly when it is least affordable.

## Consequences

- Kit config (ADR-0019 surface) gains: `reveal_threshold_bps: u16` (e.g. 6666 = 2/3),
  `shortfall_policy` (v1 single variant `Redraw`), `max_draw_attempts: u8` (default 3). These
  snapshot into `CaseTerms` at filing (Ugly-6 freeze) so a 48h timelock cannot shift the quorum
  mid-dispute.
- `finalize_round` checks `reveal_count >= ceil(panel × threshold_bps / 10000)`. If met → credit
  each revealer `fees_earned += fee_per_juror` (ADR-0020), set `result`, transition to
  `RoundResolved`. If not → no credits, transition to a redraw-eligible state.
- New permissionless `redraw` crank: for the just-closed round, slash no-shows
  (`stake_delta -= α · min_stake`, `slash_reserve -= α · min_stake`, `active_draws--`), leave
  revealers' `fees_earned` untouched (they earned nothing — the round failed), increment
  `draw_attempt`, reset the round windows, re-open `Created` for the new seats.
- `draw_seat` seed derivation gains the `draw_attempt` dimension (see table above). The frozen root
  is reused across all `draw_attempt`s (immutable; entropy comes from `draw_attempt`).
- `max_draw_attempts` exhausted → `Failed` (ADR-0014 escape semantics): refund remaining
  `dispute.fee_paid` to filer, refund outstanding appeal bonds; **slashes already written to
  no-shows' `stake_delta` stand**.
- A `> (1 − threshold)` stake holder can force `Failed` but not a wrong ruling; this is accepted as
  defense, not defeat. The self-funding reward escalation (shortfall-round slash proceeds fold into
  the final coherent pool under Option A) raises the prize for whoever finally delivers a ruling.
- Veto-by-abstention is reintroduced but **priced** (`α · min_stake × seats × attempts`) and
  **bounded** (`max_draw_attempts`); the existing no-quorum liveness hedge is intentionally traded
  for no-mandate safety.
- `reveal` no longer credits fees (moved to `finalize_round`); shortfall rounds pay nothing → no
  redraw fee funding needed.
- Complements ADR-0020 (fee conditionality + `fees_earned`/`stake_delta`), ADR-0014 (`Failed`
  escape), ADR-0019 (kit config surface), ADR-0018 (settlement reads the final ruling). Supersedes
  nothing (the prior no-quorum behavior was an undocumented implementation detail, not a locked
  ADR).

## Implementation

Tracked in the reveal-quorum milestone bean (Epic: program), sequenced after the two-mint/
two-vault epic (depends on `fees_earned`, `stake_delta`, and the threshold-gated fee credit).
Tasks: kit config fields + `CaseTerms` freeze; `finalize_round` threshold gate + fee credit;
`redraw` crank (slash no-shows, bump `draw_attempt`); `draw_seat` seed extension;
`max_draw_attempts → Failed`; SDK (config/instructions); LiteSVM TDD (threshold-met,
shortfall → redraw, slash accumulation, `Failed` on exhaustion, repeat-offender exclusion via
reconcile); Surfpool e2e; this ADR + SPEC/AGENTS/CONTEXT/trust-profile/integration draw-voting
doc. Coordinate with bean `accord-8m2a` (both extend the kit/`CaseTerms` struct — see the
milestone HANDOFF).
