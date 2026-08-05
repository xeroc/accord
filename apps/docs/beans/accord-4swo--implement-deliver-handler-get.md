---
# accord-4swo
title: Implement deliver handler (GET)
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
blocked_by:
    - accord-r9km
    - accord-oegd
---

---

assigned: implementer
---

src/pipeline/deliver.ts: GET /evidence/{dispute}/for/{juror}. store.get → keyring.forOperator → drawn check → decrypt in-memory → integrity gate → Watermark.apply → re-encrypt to juror → {out,operator_ephem_pub}. Unknown operator/not-drawn/premature → 404; gate fail → 409.

See milestone accord-yjno HANDOFF §1 §4 §3 for the shared contract (data types, crypto, edge cases, DoD).
