---
# accord-j1kj
title: 'Settlement corrupts accumulator — settlement_delta + reconcile_stake (REVIEW #4)'
status: completed
type: bug
priority: high
created_at: 2026-08-06T18:23:43Z
updated_at: 2026-08-06T18:28:41Z
---

settle_round_accounts mutates JurorStake.amount directly, diverging the stake ledger from the accumulator root. Fix: add settlement_delta: i64, write deltas instead of mutating amount, add permissionless reconcile_stake crank that folds delta into amount + updates the accumulator root via Merkle proof.

## Summary of Changes

### Fix: settlement_delta + reconcile_stake

1. **JurorStake.settlement_delta: i64** — added at end of struct (offset 89). Settlement writes here instead of mutating .

2. **settle_round_accounts** — second pass now writes  (accumulated slash/reward) and . Does NOT touch . Accumulator root stays canonical.

3. **unstake** — balance check uses . Accumulator proof still uses  (unchanged).

4. **reconcile_stake** — new permissionless crank. Folds  into , updates accumulator root via . No token transfers.

### Tests

- — injects delta, verifies root unchanged, reconciles, verifies root updated
- — can't withdraw past effective balance
- All 31 tests pass

Refs: REVIEW #4
