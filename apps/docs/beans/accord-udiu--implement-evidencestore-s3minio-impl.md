---
# accord-udiu
title: Implement EvidenceStore + S3/MinIO impl
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-xrdc
---

---

assigned: implementer
---

src/store/{store.ts,s3.ts}: trait put/get/delete/exists + S3Store. Object key {subaccord}/{dispute}, user-metadata plaintext-hash, idempotent put (HEAD then PUT/409). CIPHERTEXT ONLY — never accept/store plaintext. SSE-S3/KMS.

See milestone accord-yjno HANDOFF §2 §3 for the shared contract (data types, crypto, edge cases, DoD).
