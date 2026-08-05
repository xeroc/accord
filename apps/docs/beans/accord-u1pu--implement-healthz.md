---
# accord-u1pu
title: Implement /healthz
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-s3ow
blocked_by:
    - accord-dyf0
---

---

assigned: implementer
---

GET /healthz: probe S3 (HEAD bucket) + RPC reachability → 200/503. LB drains on 503.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).
