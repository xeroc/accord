---
# accord-lgoo
title: 'Appeal immediately cancelable + stranded funds/jurors (REVIEW #2)'
status: completed
type: bug
priority: critical
created_at: 2026-08-06T17:00:42Z
updated_at: 2026-08-06T17:36:11Z
---

appeal resets state to Created but leaves filed_at unchanged, so the pre-draw cancel timeout (already elapsed from round 0) fires immediately. Cancel strands appeal fees, bonds, and prior-round active_draws. Fix: (1) stamp filed_at=now on appeal, (2) release prior-round jurors in cancel, (3) allow claim_appeal_refund on Failed.

## Summary of Changes

### Fix 1: Timestamp reset (appeal)

`appeal` now stamps `dispute.filed_at = now` when resetting state to Created. Without this, the original filing timestamp (long past after the first round) made the dispute immediately cancelable.

### Fix 2: Prior-round juror release (cancel_dispute)

New `release_prior_rounds` helper iterates rounds 0..current_round, verifies each Round PDA + JurorStake PDA, and decrements active_draws. Called from both the pre-draw and post-draw cancel branches.

### Fix 3: Appeal bond recovery (claim_appeal_refund)

`claim_appeal_refund` now accepts `Final` or `Failed` state, so appeal bonds are returnable after cancellation.

### Known limitation

Appeal fees (fee_new deposited by the appellant into the vault) remain stranded on cancel — the cancel handler refunds only the filer's round-0 fee. Appeal bonds are recoverable via claim_appeal_refund. Full per-depositor accounting is a follow-up.

### Tests

- `cancel_blocked_immediately_after_appeal_timestamp_reset` — proves the timestamp reset works
- All 27 LiteSVM tests pass

Refs: accord-s2l5 (REVIEW #1, committed together)

## Follow-up: fee+bond merge (resolved)

Merged fee_new + bond into AppealBond.amount (total deposit). The fee is derived at settlement from panel_size_for_round(terms, round_idx) * fee_per_juror. This eliminates the stranded-appeal-fee limitation:

- cancel_dispute: filer refund = vault.amount - Σ(AppealBond.amount)
- claim_appeal_refund: returns full amount on Failed, bond_portion on Final
- finalize_dispute: forfeits only bond_portion (not fee) into coherent pool

Commit: 65d68de. Test: cancel_with_appeal_bond_reserves_and_claim_recovers proves zero stranded funds.
