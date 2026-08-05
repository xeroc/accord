---
# accord-r9km
title: Implement ingest handler (POST)
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
---

---

assigned: implementer
---

src/pipeline/ingest.ts: POST /evidence/{subaccord}/{dispute}. Validate plaintext_hash==Dispute.evidence_hash, store.put (idempotent 201/409). Reject bad bundles (400).

See milestone accord-yjno HANDOFF §1 §4 for the shared contract (data types, crypto, edge cases, DoD).
