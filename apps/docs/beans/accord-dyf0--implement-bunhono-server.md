---
# accord-dyf0
title: Implement Bun+Hono server
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-s3ow
---

---

assigned: implementer
---

src/server/{app,routes}.ts + main.ts: wire ingest/deliver routes, TLS (EVIDENCE_TLS_*), per-IP rate limit (EVIDENCE_RATE_LIMIT_PER_MIN), optional X-Account-Key accounting-only. Stateless, HA-ready.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).
