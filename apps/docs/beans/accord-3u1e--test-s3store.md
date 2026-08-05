---
# accord-3u1e
title: Test S3Store
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-xrdc
blocked_by:
    - accord-udiu
---

---

assigned: tester
---

put/get round-trip, idempotency (same hash no-op, different hash 409), missing→null, never-plaintext invariant (object body is ciphertext). Use MinIO testcontainer or S3 mock.

See milestone accord-yjno HANDOFF §5 §6 for the shared contract (data types, crypto, edge cases, DoD).
