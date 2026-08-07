---
# accord-sffz
title: "LiteSVM TDD: two-mint stake/fee flows, fees_earned, withdraw_fees, invariant"
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T20:30:00Z
parent: accord-edz4
blocked_by:
  - accord-djzb
---

assigned: tester. TDD per instruction (RED→GREEN): stake→stake_vault; create_dispute→fee_vault; reveal credits nothing; withdraw_fees (incl. active_draws>0 succeeds); assert_fund_invariants after every op; settle writes fees_earned+stake_delta.

## Summary of Changes

**LiteSVM integration test (`accumulator_litesvm.rs`) updated for ADR-0020 two-mint:**

- All field references renamed: `amount → staked` (15×), `settlement_delta → stake_delta` (7×).
- Account context fields: `vault → stake_vault` (Stake/Withdraw), `staking_token/vault → fee_token/fee_vault` (CreateDispute 10×, CancelDispute 5×, ClaimAppealRefund, Appeal), `associated_token_program` added to CreateDispute.
- `Reveal` context: removed 4 token account fields (staking_token, juror_token_account, vault, token_program).
- `CreateSubaccordParams` (3×): added `fee_token` field.
- `finalize_round`: appended JurorStake PDAs as remaining_accounts (required for fees_earned credit when fee_per_juror > 0).
- Settlement assertion updated: two-pool split — `stake_delta = 50` (slash share, coherent) / `-100` (slash, incoherent); `fees_earned = 1_500_000` (base fee + coherent fee share) / `0` (non-revealer).

**Result: 43/43 tests pass** (7 lib unit + 31 accumulator + 1 health + 4 pause). `make test_unit` green.
