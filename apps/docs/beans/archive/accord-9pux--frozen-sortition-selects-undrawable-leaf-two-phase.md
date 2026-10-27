---
# accord-9pux
title: 'Frozen sortition selects undrawable leaf + two-phase withdraw + slash_reserve (REVIEW #5)'
status: completed
type: bug
priority: high
created_at: 2026-08-06T19:52:25Z
updated_at: 2026-08-06T20:04:14Z
---

Sortition can select a leaf with insufficient stake or one that unstaked post-freeze. Fix: (1) slash_reserve tracks exact pending slash exposure per juror, enforced at draw time, (2) two-phase request_withdraw+withdraw replaces instant unstake, (3) WITHDRAWAL_DELAY=PRE_DRAW_CANCEL_TIMEOUT_SECS ensures draws complete before tokens leave.

## Summary

Committed as f6a141a. slash_reserve + two-phase withdraw + WITHDRAWAL_DELAY.

33 tests pass. All REVIEW #5 failure modes addressed:

- Mode 1 (below-min leaf): prevented by slash_reserve check at draw time
- Mode 2 (post-freeze unstake): prevented by two-phase withdraw (root updates at request, tokens locked until timelock + active_draws == 0)
