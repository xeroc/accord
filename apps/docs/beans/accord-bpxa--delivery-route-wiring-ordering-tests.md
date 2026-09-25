---
# accord-bpxa
title: Delivery route wiring + ordering tests
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:20Z
updated_at: 2026-09-22T13:14:59Z
parent: accord-85jo
blocked_by:
    - accord-tksq
---

Register index + per-file routes; 'for'-literal ordering vs generic GET; handler tests.

## Summary of Changes

- routes.ts: GET /evidence/:dispute/for/:juror/:round/* (splat path, guards)
- handlers.ts: DeliverFileHandler/Result; ServerDeps.deliverFile
- wire.ts: deliverFileHandler (base64 seam); deliver index now exposes files[]+complete per round (was dropped in mapping)
- app.test.ts: 3 route tests; suite 330/330 green
