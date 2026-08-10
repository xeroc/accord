---
# accord-aqmw
title: Fix zero-coherent settlement economics
status: completed
type: bug
priority: high
created_at: 2026-08-10T02:17:26Z
updated_at: 2026-08-10T15:30:25Z
---

## Problem

When `coherent_count == 0`, `settle_round_accounts` now divides the forfeited fee pool among every drawn juror, including incoherent voters and non-revealers. A valid configuration with `reveal_threshold_bps = 0` and `alpha_bps = 0` lets a round with no reveals resolve and return fees to every no-show without any slash. Overturned prior rounds similarly reward jurors whose participation was explicitly incoherent with the final ruling.

The fee division also strands `fee_pool % panel`, while the slashed stake-token pool still has no recipient when no juror is coherent, leaving custody greater than the withdrawable stake ledger.

Relevant code:

- `programs/accord/src/lib.rs:2694-2726`
- `programs/accord/src/lib.rs:2773-2788`
- `programs/accord/tests/accumulator_litesvm.rs:3380-3467`

## Acceptance Criteria

- [x] Revealers receive both pools when coherent_count == 0; zero reveals → trapped as protocol surplus (accord-31xw).
- [x] Non-revealers are NEVER rewarded — slashed only.
- [x] reveal_count > 0: both pools redistributed to revealers. reveal_count == 0: surplus trapped (deferred to accord-31xw).
- [x] Integer-div remainder → protocol surplus (unchanged).
- [x] LiteSVM: settle_round_no_coherent_rewards_revealers_only + settle_round_zero_reveals_traps_surplus — both green.
- [x] Per-juror stake_delta + fees_earned assertions verify net splits.
- [x] security-checklist.md H-3 + SPEC.md redistribution updated.

## Summary of Changes

### Decision

When `coherent_count == 0`:

- `reveal_count > 0` → pools (fee + stake) split among **revealers** only. Non-revealers slashed, no reward.
- `reveal_count == 0` → nobody rewarded. Both pools trapped as protocol surplus (follow-up: accord-31xw).

### Code (`lib.rs:2683` `settle_round_accounts`)

- Replaced `consolation_fee` with `reward_count = coherent_count > 0 ? coherent_count : reveal_count`.
- Second pass: slash liability (`!is_coherent`) separated from reward eligibility (coherent normally; `reveals[i] != u8::MAX` as zero-coherent fallback).
- A revealer in the zero-coherent case is both slash-liable and reward-eligible.

### Tests

- `settle_round_no_coherent_rewards_revealers_only` — 2 revealers stake_delta=+50/fees=500k; non-revealer -100/0.
- `settle_round_zero_reveals_traps_surplus` — all slashed, zero rewards.
- Normal path unchanged.

### Follow-up

- `accord-31xw`: make zero-reveal surplus authority-claimable.
