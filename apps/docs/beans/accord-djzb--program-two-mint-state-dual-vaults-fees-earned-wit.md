---
# accord-djzb
title: 'Program: two-mint state + dual vaults + fees_earned + withdraw_fees + invariant'
status: todo
type: task
priority: high
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T18:07:45Z
parent: accord-edz4
---

assigned: implementer. See milestone HANDOFF §2. Files: state.rs (rename amount→staked, settlement_delta→stake_delta, +fees_earned; Subaccord +fee_token; CaseTerms fields), layout.rs (JS_*_OFF + offsets_match_borsh), lib.rs (stake/withdraw→stake_vault; create_dispute/appeal→fee_vault; reveal fee-removal; new withdraw_fees; settle writes fees_earned+stake_delta), constants.rs, errors.rs, events.rs. Wire assert_fund_invariants.
