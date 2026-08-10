---
# accord-fdad
title: Prevent withdraw_fees from consuming reserved vault funds
status: completed
type: bug
priority: high
created_at: 2026-08-10T02:17:26Z
updated_at: 2026-08-10T16:43:33Z
---

## Problem

`withdraw_fees` caps a juror claim against the gross `fee_vault.amount`. Gross vault balance is not necessarily unreserved fee liquidity: it can back other jurors' `fees_earned`, active disputes' `fee_paid`, outstanding appeal bonds, and stake collateral when `staking_token == fee_token` causes both ATAs to collapse to one address.

Relevant code:

- `programs/accord/src/lib.rs:2068-2109`
- `programs/accord/tests/accumulator_litesvm.rs:4781-4829`

The new underfunding test explicitly creates only 5,000 units of stake collateral in the shared ATA and expects `withdraw_fees` to drain all 5,000. That leaves the stake ledger backed by no tokens. In other insolvency cases, first claimants can consume other disputes' or jurors' reserved funds.

## Acceptance Criteria

- [ ] Define and enforce fee-vault liabilities and unreserved withdrawable liquidity.
- [ ] `withdraw_fees` cannot consume stake collateral, active `fee_paid`, outstanding appeal deposits/bonds, or other jurors' claims.
- [ ] Same-mint Subaccords preserve full stake-vault backing after fee withdrawals.
- [ ] Add separate-mint and same-mint insolvency regression tests.
- [ ] Add a multi-claimant test proving claim order cannot transfer another claimant's reserved funds.
- [ ] Reconcile this fix with the failed-dispute appeal-refund accounting bug.
