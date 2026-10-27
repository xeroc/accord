---
# accord-qudg
title: 'HTTP wiring: PUT route + body parse + handler tests'
status: completed
type: task
priority: normal
created_at: 2026-09-22T11:35:20Z
updated_at: 2026-09-22T13:03:34Z
parent: accord-np69
blocked_by:
    - accord-x4cp
---

PUT /evidence/:subaccord/:dispute/:round/*path route, base58 body parse, route-order safety vs synod + manifest GET.

## Summary of Changes

- routes.ts: PUT /evidence/:sa/:d/:round/* (Hono splat; path from decoded c.req.path remainder; empty/backslash → 400)
- handlers.ts: IngestFileHandler/IngestFileResult (no Location — file objects have no public GET)
- wire.ts: ingestFileHandler (same parseIngestBody shape, one ECIES bundle per doc) + WireDeps maxDocBytes/maxPackageBytes; main.ts wiring
- app.test.ts: 6 route tests (wildcard capture, status reflection, guards); wire.test.ts: real-ECIES multifile test (POST manifest + PUT doc + wrong-leaf reject); suite 321/321
