---
# accord-pwa9
title: Change Dispute.evidence_hash to evidence_hashes array
status: todo
type: task
priority: critical
tags:
    - implementer
created_at: 2026-08-09T16:56:29Z
updated_at: 2026-08-09T16:56:29Z
parent: accord-hoaj
---

See milestone accord-qp7c HANDOFF. Replace evidence_hash: [u8;32] with evidence_hashes: [[u8;32]; MAX_APPEALS+1]. Write evidence_hashes[0] in create_dispute. Update all reads.
