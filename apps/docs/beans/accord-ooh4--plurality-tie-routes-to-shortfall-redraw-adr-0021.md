---
# accord-ooh4
title: Plurality tie routes to shortfall redraw (ADR-0021 seam)
status: completed
type: feature
priority: normal
created_at: 2026-08-18T16:08:34Z
updated_at: 2026-08-18T16:23:31Z
---

Plurality literal tie (quorum met, argmax not unique) routes to RedrawEligible via the ADR-0021 shortfall seam instead of max_by_key's last-index pick.

## Summary of Changes

- finalize_round.rs Plurality arm: after the quorum gate, count argmax leaders; if >1, set RedrawEligible and return — mirroring the shortfall branch exactly. Degenerate bps=0/zero-reveal rounds now redraw too (previously resolved to option 0).
- accumulator_litesvm.rs: harness parametrized to per-juror votes (setup_and_finalize_votes; old signature delegates with vote 0); new tie_routes_to_redraw_eligible_no_credits pins state, unbilled revealers, result sentinel, and redraw → Created with draw_attempt=1.
- quorum-redraw.spec.ts: e2e 'literal tie (quorum met)' — 1-1 split on 2-of-3 reveals → RedrawEligible → redraw → Created; revealers unslashed/unbilled, no-show slashed.
- SPEC.md row 10 + state-machine paragraph + edge-case table: replaced the false 'Ties: impossible (odd Juror counts)' claim.
- No IDL/instruction change ⇒ no codegen; cranker already dispatches redraw off RedrawEligible state (cause-agnostic); qedspec models the tally as out-of-scope.

Verification: all 115 Rust unit+LiteSVM tests green; jest e2e 18 suites / 66 tests green vs fresh offline Surfnet (8905) with rebuilt .so; workspace lint/build/test trio exit 0.
