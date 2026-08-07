---
# accord-pcmo
title: advance_pending crank (Pending → Listed)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-6vih
blocked_by:
    - accord-7tsl
---

Target: `programs/canon/src/instructions/advance_pending.rs`.
Change: permissionless `advance_pending(ctx, item)` → require state==Pending and `listing_window` elapsed and not Disputed; Pending → Listed.
Acceptance (TDD): LiteSVM — advances after window; reverts before window; reverts if Disputed.
Dependencies: submit_item. Authority: programs/canon/SPEC.md §Instructions #3, §Item state machine.
