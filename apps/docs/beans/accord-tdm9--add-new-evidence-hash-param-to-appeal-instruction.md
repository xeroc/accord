---
# accord-tdm9
title: Add new_evidence_hash param to appeal instruction
status: todo
type: task
priority: critical
tags:
    - implementer
created_at: 2026-08-09T16:56:29Z
updated_at: 2026-08-09T16:56:37Z
parent: accord-hoaj
blocked_by:
    - accord-pwa9
---

See milestone accord-qp7c HANDOFF. appeal() gains new_evidence_hash: [u8;32] arg. Write to evidence_hashes[current_round+1]. [0u8;32] sentinel = no new evidence.
