---
# accord-c2i0
title: CLI domain:put / domain:get + useaccord skill update
status: todo
type: task
tags:
    - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-18T23:00:04Z
parent: accord-x49o
blocked_by:
    - accord-lohs
    - accord-49b3
---

apps/cli/src/commands/domain/: domain:put <file> (sha256 → PUT → print hash), domain:get <hash> (fetch → re-hash → print). --daemon-url flag + ACCORD_DAEMON_URL env fallback. Update .agents/skills/useaccord/ examples + flag tables in the same change (AGENTS change-coupling). Uses SDK domain.ts only — no hand-rolled hashing.
