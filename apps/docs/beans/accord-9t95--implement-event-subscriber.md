---
# accord-9t95
title: Implement event subscriber
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-mwfq
blocked_by:
    - accord-h1v2
---

---

assigned: implementer
---

src/chain/events.ts: subscribe DisputeCreated/JurorsDrawn/RulingFinalized as indexing + retention hints (cache only; reader is source of truth).

See milestone accord-yjno HANDOFF §1 for the shared contract (data types, crypto, edge cases, DoD).
