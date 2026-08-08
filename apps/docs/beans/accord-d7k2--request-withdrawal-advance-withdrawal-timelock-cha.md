---
# accord-d7k2
title: request_withdrawal + advance_withdrawal (timelock + challengeable)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-1eoy
blocked_by:
    - accord-7tsl
---

Target: `programs/canon/src/instructions/withdrawal.rs`.
Change: `request_withdrawal(ctx, item)` (submitter-only; from Listed) → WithdrawPending; open `withdrawal_timelock` challenge window. `advance_withdrawal(ctx, item)` (permissionless crank) → after timelock + unchallenged → return `accumulated_stake` to submitter, close item (Removed). A `challenge_item` during WithdrawPending re-enters the dispute path (settled by settle_item; item Removed either way).
Acceptance (TDD): LiteSVM — withdrawal flow; timelock enforced; reverts on early advance; challenged-withdrawal routes to dispute. No Pending-cancel (Q20).
Dependencies: submit_item. Authority: programs/canon/SPEC.md §Instructions #6/#7, §Edge cases; Q10/Q20.
