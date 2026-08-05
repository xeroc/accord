---
# accord-vx8c
title: HA deployment artifacts
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

Dockerfile + systemd unit (or k8s manifest): N stateless replicas behind LB, shared EVIDENCE_KEYRING env + shared S3 bucket, retention sweep notes.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).
