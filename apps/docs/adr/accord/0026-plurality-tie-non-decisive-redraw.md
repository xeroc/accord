# Plurality top-count tie is a non-decisive round — `RedrawEligible`, not an arbitrary winner

A Plurality tally that ends in a **top-count tie** (two or more options sharing the maximum
vote count) is treated as a **non-decisive round** — the same family as the ADR-0021
reveal-quorum shortfall. `finalize_round` writes no result, credits no fees, and transitions
the dispute to `RedrawEligible`; the existing `redraw` crank reconvenes the same-size panel
(`draw_attempt++`), and `max_draw_attempts` exhaustion still ends in `Failed` with the filer
refund. No new state, instruction, account field, or config knob.

Decided in the PROG-MULTI-PARTY grilling of 2026-08-18 (Q-d — owner override over a
wrapper-side recount), captured as bean `accord-n3vw`. Extends ADR-0021's non-decisive family.

## Why odd panels do not save you

The odd-panel rule (`min_jury_size` must be odd) prevents ties only for **binary,
full-reveal** rounds. Two structural holes remain:

- **≥3 options, full reveal, odd panel**: a 5-panel voting 2-2-1 across three options ties
  at the top — no option has a majority of the panel, and the modal count (2) is shared.
- **Non-reveals, any option count**: with a 2/3 reveal quorum a 5-panel may reveal only 4,
  and 4 votes split 2-2 even on a binary dispute. ADR-0021 gates the *quorum*, not the
  *decisiveness* — a round can clear quorum and still deadlock.

The pre-ADR-0026 tally resolved both via `.max_by_key`, which crowns the **highest tied
option index** — deterministic, but arbitrary: an N-party Arbitrable whose option list ends
in a neutral/none-of-the-above label would see every dead heat resolved against the parties,
and a binary Canon challenge would resolve 2-2 toward option 1 for no reason at all.
Crowning any winner out of a dead heat is a correctness hole in Accord's own aggregation;
every N-option Arbitrable inherits it.

## Decision rules

- Tie detected **after** the ADR-0021 quorum gate: quorum shortfall still wins (shortfall
  rounds never reach the tally).
- Tie branch: `dispute.state = RedrawEligible`, no `round.result` (stays `u64::MAX`), no
  `fees_earned` credits, `dispute.fee_paid` untouched — identical economics to a shortfall
  round. Revealers are not slashed (they showed up); the `redraw` crank slashes only actual
  no-shows.
- Degenerate zero-reveal round (possible only with `reveal_threshold_bps = 0`): all options
  tie at count 0 → `RedrawEligible` instead of the old fabricated last-index winner. Strictly
  safer, and consistent with the settlement path's degenerate-config handling.
- **No `tie_policy` config field.** One uniform rule for every Plurality pool; picking an
  option out of a tie is wrong, and configurability would only reintroduce the bug as a
  default.
- `Median` (ADR-0025) is untouched: a median always exists; even reveal counts take the
  documented upper-middle element.

## Considered Options

- **Keep `.max_by_key` (status quo).** Rejected — an arbitrary winner out of a dead heat is
  a zero-mandate ruling of exactly the kind ADR-0021 was written to kill; it is worse than
  the tie-break CONCEPT-REVIEW §4.9 flagged, because with ≥3 options it fires on
  full-reveal odd panels, not just no-show rounds.
- **Wrapper-side recount (Arbitrable detects the tie and refiles).** Rejected in the
  2026-08-18 grilling: the wrapper cannot see per-option counts without an indexer, re-filing
  burns a fresh fee + a new dispute PDA per dead heat, and every future Arbitrable would
  reimplement the same dance. The aggregation hole is Accord's; the fix belongs in Accord.
- **Owner/authority tie-break (draw a winner by VRF).** Rejected — randomness picks a
  winner with no mandate; indistinguishable from `.max_by_key` with extra steps.
- **Tie → `RedrawEligible` via the ADR-0021 seam (chosen).** Zero new machinery: same
  state, same crank, same exhaustion terminal. A tie is behaviorally a "round that produced
  no answer", which is precisely what the shortfall path already models.

## Consequences

- **Behavior change for every Plurality consumer, including Canon**: rounds that previously
  "resolved" 2-2 (or 2-2-1) to the highest tied index now redraw. Consumers that enact on a
  ruling can never again be handed an arbitrary winner out of a dead heat; in exchange, a
  sustained symmetric split can push a dispute to `Failed` after `max_draw_attempts` — the
  filer's fee is refunded there (ADR-0014 escape), so the cost is liveness, not funds.
- Draw economics: a tie round pays nobody, so the filer's single round-0 deposit still
  covers the whole redraw ladder (ADR-0021 property preserved).
- N-party Arbitrables (Synod, ADR `synod/0001`) need **no tie handling of their own**:
  payout logic reads only `Final`/`Failed`, and a tie can no longer crown an arbitrary
  party. A tie before `Final` simply keeps the case in the redraw ladder.
- The odd-`min_jury_size` rule stays (it still eliminates binary full-reveal ties, the most
  common shape); this ADR covers what it cannot.
- SDK/CLI surface unchanged — no IDL delta (no new accounts, args, errors, or events).

## Implementation

`finalize_round.rs` Plurality arm only: after counting reveals into `counts[..num_options]`,
compare the max count's multiplicity; >1 → early return with `RedrawEligible`, else
`position(max)` (which, unlike the old `.max_by_key`, is unique by construction). TDD:
LiteSVM (`accumulator_litesvm.rs` — 2-2 binary via non-reveal on a 5-panel, 2-2-1
full-reveal 3-option on a 5-panel, decisive 3-0-2 regression, tie→redraw→re-vote cycle) +
Surfpool e2e (`tests/src/quorum-redraw.spec.ts` scenario 3). Bean `accord-n3vw`.
