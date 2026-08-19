---
# accord-uecf
title: SDK — putDomainDoc helper
status: todo
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:35:35Z
parent: accord-5p9j
---

`putDomainDoc(daemonUrl, bytes, { subaccord })` in packages/sdk/src/domain.ts: PUT {daemonUrl}/domains/{sha256Hex(bytes)}?subaccord=<addr>, Content-Type text/markdown default. Idempotent 200/201 → ok; 400/404/409/413 → typed errors carrying status + body. Single implementation — CLI and both dApps consume it.

TDD: unit tests for hash computation, param shape, ?subaccord param, status mapping before implementation.
