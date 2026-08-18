---
# accord-ejga
title: Consistency review — Anchor 1.0.2 + canon parity, workspace green
status: todo
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-l7k7
blocked_by:
    - accord-y8w1
---

assigned: reviewer
The milestone gates on consistency: crate layout vs canon (SEED_ constants, error enums, per-instruction handler files, thin #[program]), codegen discipline (generated never hand-edited; make codegen idempotent — diff clean on re-run), SDK facade vs canon facade patterns, e2e harness reuse (zero duplicated RPC/payer boilerpling), CI workflow commands green (pnpm -r --filter packages/apps lint+build+test), make lint + make test green, change-coupling greps from AGENTS.md (no stale references anywhere). Blocks milestone completion.
