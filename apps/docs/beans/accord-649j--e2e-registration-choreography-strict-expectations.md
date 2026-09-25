---
# accord-649j
title: 'e2e: registration choreography + strict expectations'
status: todo
type: task
priority: normal
created_at: 2026-09-25T08:59:30Z
updated_at: 2026-09-25T09:00:45Z
parent: accord-5q2n
blocked_by:
    - accord-5wkt
---

---

assigned: tester
---

Rework `tests/src/e2e.test.ts` + setup: jurors register before delivery fetch (keypair signMessage == plain `ed25519.sign`), local protocol reimpl switches to X25519 delivery secrets. Cases: strict-404 unregistered, stale-registration 409, wrong-wallet sig 400, self-heal flow, non-juror-key decrypt failure. GREEN on Surfpool, no skips (green rule).
