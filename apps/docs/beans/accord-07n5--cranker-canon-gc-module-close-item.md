---
# accord-07n5
title: Cranker — canon GC module (close-item)
status: completed
type: epic
priority: normal
created_at: 2026-08-14T19:06:10Z
updated_at: 2026-08-19T19:47:45Z
parent: accord-clfq
---

Extend apps/cranker with a canon module: listener trigger on Removed CanonItem notifications (ItemSettled/Withdrawn-driven) + reconciler getProgramAccounts sweep for delisted items; dispatch close_item with dedup and profitability guard. accord-7fj6 (lifecycle cranks) stays parked and builds on this seam later.
