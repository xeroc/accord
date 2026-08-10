---
# accord-aqmw
title: Fix zero-coherent settlement economics
status: todo
type: bug
priority: high
created_at: 2026-08-10T02:17:26Z
updated_at: 2026-08-10T02:17:26Z
---

## Problem

When `coherent_count == 0`, `settle_round_accounts` now divides the forfeited fee pool among every drawn juror, including incoherent voters and non-revealers. A valid configuration with `reveal_threshold_bps = 0` and `alpha_bps = 0` lets a round with no reveals resolve and return fees to every no-show without any slash. Overturned prior rounds similarly reward jurors whose participation was explicitly incoherent with the final ruling.

The fee division also strands `fee_pool % panel`, while the slashed stake-token pool still has no recipient when no juror is coherent, leaving custody greater than the withdrawable stake ledger.

Relevant code:

- `programs/accord/src/lib.rs:2694-2726`
- `programs/accord/src/lib.rs:2773-2788`
- `programs/accord/tests/accumulator_litesvm.rs:3380-3467`

## Acceptance Criteria

- [ ] Specify the intended beneficiary or accounting treatment for fee and stake surplus when no juror is coherent.
- [ ] Non-revealers and incoherent jurors are not rewarded merely because `coherent_count == 0`, unless governance explicitly adopts and documents that economic rule.
- [ ] Handle both fee-token and stake-token surplus without creating permanently unclaimable custody.
- [ ] Define deterministic handling for integer-division remainder.
- [ ] Test zero-threshold/no-reveal and overturned-prior-round scenarios.
- [ ] Assert conservation across token custody and ledger claims.
- [ ] Correct the security checklist only after the complete behavior is implemented.
