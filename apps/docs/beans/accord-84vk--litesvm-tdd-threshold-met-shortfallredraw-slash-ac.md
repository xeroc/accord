---
# accord-84vk
title: "LiteSVM TDD: threshold-met, shortfall→redraw, slash-accumulation, Failed, repeat-offender"
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T21:55:00Z
parent: accord-z8jp
blocked_by:
  - accord-5yh0
---

assigned: tester. TDD: threshold-met credits+RoundResolved; shortfall no-credit+RedrawEligible; redraw slashes no-shows stake_delta, draw_attempt++, panel/round_idx unchanged; max_draw_attempts→Failed (refund+slashes stand); reconcile→free_stake gate excludes repeat no-show; seed determinism across draw_attempt.

## Summary of Changes

LiteSVM TDD coverage for ADR-0021 (E2) — 6 new tests in
`programs/accord/tests/accumulator_litesvm.rs`, all driven through the real
`.so` via the existing anchor-litesvm harness.

### Shared harness (factored to avoid per-test duplication)

- `setup_accumulator_with(reveal_threshold_bps, max_draw_attempts)` — extracted
  from `setup_accumulator` (which now delegates with the v1 defaults 6_666 / 3)
  so ADR-0021 tests can configure the quorum + redraw cap without duplicating
  the ~80-line subaccord/mint/pause setup.
- `vrf_seed(vrf, dispute, round_idx, draw_attempt)` + `seat_leaf(...)` — mirror
  the on-chain sortition seed (incl. the new `draw_attempt` dimension) and
  leaf resolution, so tests compute expected seats off-chain deterministically.
- `DrawnDispute` + `setup_and_finalize(threshold_bps, max_draw_attempts, n_reveal)`
  — runs the full stake→create_dispute→VRF-freeze→draw→commit→reveal→finalize
  pipeline and returns the post-finalize bundle (env, dispute, round, drawn
  jurors, filer, fee, vrf, total, prefixes) for assertion + redraw driving.
- `do_redraw(dd)` — drives the new `redraw` ix for round 0 (panel juror-stake
  remaining accounts).

### Tests (each maps to a HANDOFF §6 matrix row)

1. `threshold_met_credits_fees_and_resolves` — low threshold (3_333 ⇒ needs 1),
   1 reveal ⇒ `RoundResolved`, revealer `fees_earned` credited, `fee_paid`
   decremented, non-revealers earn nothing.
2. `shortfall_round_goes_redraw_eligible_no_credits` — threshold 10_000
   (needs all 3), 1 reveal ⇒ `RedrawEligible`, no credits, `fee_paid` intact.
3. `redraw_slashes_noshows_and_reopens_created` — shortfall → redraw ⇒
   no-shows slashed into `stake_delta` (-100), all drawn `active_draws` +
   `slash_reserve` released, `draw_attempt` 0→1, round cleared, `round_idx` +
   panel size unchanged, state → `Created`; revealer not slashed.
4. `redraw_exhaustion_fails_and_refunds_filer` — `max_draw_attempts=1` ⇒ first
   redraw exhausts → `Failed`, filer refunded the full `fee_paid` (3_000_000),
   `fee_paid` zeroed, no-shows' slashes retained, `active_draws` released.
5. `redraw_seed_advances_with_draw_attempt` — proves `seed(…,draw_attempt=0) ≠
seed(…,draw_attempt=1)`; after redraw, a fresh panel fills at `draw_attempt=1`
   via the faithful retry walk (`submit_draw_panel`), collisions and all.
6. `reconciled_noshow_excluded_from_redraw_by_free_stake` — a minimal-stake
   juror (1_100 = min_stake + slash_per_juror) is slashed (inject) + reconciled
   (→1_000), then a VRF brute-forced to select it passes sortition but the
   `draw_seat` free-stake gate (1_000 < 1_100) rejects it → `InsufficientStake`.
   (Pairs with test #3 to cover the full "redraw slash → reconcile → exclude"
   loop.)

### Verification

- `make test_unit`: **49/49 green** (7 lib + **37** accumulator_litesvm [+6 new]
  - 1 health + 4 pause).
- `make lint`: clean.
- No program-source changes (program landed in accord-5yh0); this bean is
  test-only + the `setup_accumulator` refactor (delegates to the parameterized
  helper; existing callers unaffected).

### Notes

- The reconcile-exclusion test uses `inject_settlement_delta` to simulate the
  redraw slash (the slash write path itself is proven by test #3); together they
  cover the repeat-offender exclusion without a costly multi-redraw cycle.
