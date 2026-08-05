---
# accord-xrdc
title: Encrypted-at-rest Storage
status: todo
type: epic
priority: high
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-yjno
blocked_by:
    - accord-djso
---

EvidenceStore trait + S3/MinIO impl. Ciphertext-only objects, idempotent on plaintext_hash, SSE defense-in-depth.

See milestone accord-yjno HANDOFF §2 §3 for the shared contract (data types, crypto, edge cases, DoD).
