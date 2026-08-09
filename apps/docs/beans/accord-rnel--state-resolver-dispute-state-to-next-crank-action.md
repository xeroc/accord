---
# accord-rnel
title: State resolver — dispute state to next crank action
status: todo
type: task
priority: normal
created_at: 2026-08-09T20:14:41Z
updated_at: 2026-08-09T20:14:54Z
parent: accord-rev4
blocked_by:
    - accord-7d4c
---

src/state.ts: pure function `resolveNextAction(dispute, round, now) => CrankAction | null`.
Covers all 10 crank actions (see milestone HANDOFF §1 table).
Reads decoded Dispute + Round accounts from SDK decoders.
Returns null when waiting for a time window or user action.
No side effects — pure logic, unit-testable.
