---
# accord-xh6n
title: e2e test vs Surfpool
status: todo
type: task
priority: normal
created_at: 2026-08-05T14:32:37Z
updated_at: 2026-08-05T14:55:01Z
parent: accord-0t29
---

---

assigned: tester
---

tests/e2e.test.ts: create_dispute → post_snapshot → commit_vrf → draw → juror GET from running daemon → juror decrypts → verify sha256==evidence_hash. The green-rule sign-off (AGENTS.md e2e suite).

See milestone accord-yjno HANDOFF §1 §5 §6 for the shared contract (data types, crypto, edge cases, DoD).
