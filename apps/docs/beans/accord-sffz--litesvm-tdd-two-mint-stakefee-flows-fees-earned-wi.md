---
# accord-sffz
title: 'LiteSVM TDD: two-mint stake/fee flows, fees_earned, withdraw_fees, invariant'
status: todo
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T18:07:45Z
parent: accord-edz4
blocked_by:
    - accord-djzb
---

assigned: tester. TDD per instruction (RED→GREEN): stake→stake_vault; create_dispute→fee_vault; reveal credits nothing; withdraw_fees (incl. active_draws>0 succeeds); assert_fund_invariants after every op; settle writes fees_earned+stake_delta.
