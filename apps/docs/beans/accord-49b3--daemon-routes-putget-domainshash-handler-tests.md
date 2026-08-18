---
# accord-49b3
title: Daemon routes — PUT/GET /domains/{hash} + handler tests
status: todo
type: task
tags:
    - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-18T23:00:04Z
parent: accord-iq0j
blocked_by:
    - accord-v9v9
---

TDD. Wire routes per HANDOFF §4 pseudo-code: 400 hash mismatch / malformed hex, 413 over 1 MiB, 200 idempotent no-op, 409 collision, 404 unknown, ETag + Cache-Control immutable, default content-type text/markdown. Rate-limit like existing routes. Acceptance: HANDOFF §5 daemon bullets + §6.
