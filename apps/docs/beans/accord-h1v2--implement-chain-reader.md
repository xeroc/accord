---
# accord-h1v2
title: Implement chain reader
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:45:08Z
parent: accord-mwfq
---

---

assigned: implementer
---

src/chain/reader.ts via @accord/sdk: read Subaccord (evidence_operator/evidence_spec), Dispute (evidence_hash/state), Round (jurors[]). Helpers: isDrawn(dispute,juror), isDeliverable(dispute). Round account is authoritative.

See milestone accord-yjno HANDOFF §1 §2 for the shared contract (data types, crypto, edge cases, DoD).
