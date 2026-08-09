---
# accord-gbxm
title: WS subscriber — program logs trigger immediate reconcile
status: todo
type: task
created_at: 2026-08-09T20:15:32Z
updated_at: 2026-08-09T20:15:32Z
parent: accord-z9nc
---

src/listener.ts:

1. Subscribe to program logs via WebSocket (ACCORD_WS_URL)
2. On any log from the Accord program: trigger immediate reconcile for affected disputes
3. Parse log to extract dispute address (best-effort — not authoritative)
4. Call reconciler.reconcileDispute(disputeAddress) immediately
5. On WS disconnect: log warning, fall back to 60s poll (reconciler is authoritative)
6. On reconnect: trigger full reconcile
This is purely a latency optimization. The reconciler loop runs regardless.
