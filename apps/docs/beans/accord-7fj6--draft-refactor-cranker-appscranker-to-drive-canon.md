---
# accord-7fj6
title: Refactor cranker (apps/cranker) to drive Canon program cranks
status: todo
type: feature
priority: normal
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-14T19:11:55Z
---

Extend apps/cranker to drive Canon's permissionless cranks: advance_pending (Pending→Listed after listing_window), settle_item (read accord final_ruling, redistribute), advance_withdrawal (return stake after withdrawal_timelock). Scope, error handling, and multi-program dispatch to be defined when unblocked. The canon app deliberately does NOT crank (milestone §3).
