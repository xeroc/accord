---
# accord-f5xg
title: Surfpool e2e — full Canon lifecycle (green-rule sign-off)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-otps
blocked_by:
    - accord-3up2
---

Role: tester. Target: `tests/src/` (jest + Surfpool, per AGENTS.md e2e section).
Change: a Canon spec driving the full lifecycle via the SDK against a running Surfpool: create_list (→ backing Subaccord) → submit_item → advance_pending → challenge_item → settle_item (keep + remove) → request_withdrawal → advance_withdrawal; assert CanonList/CanonItem state + deposit redistribution at each step. Reuse `tests/src/setup/` (env, cheats, tokens, assertions, fetchDecoded). One spec, port-agnostic (ACCORD_RPC_URL), idempotent.
Acceptance: GREEN against `make run_surfpool` + `make test_surfpool` (green-rule sign-off — AGENTS.md §e2e green rule). LiteSVM TDD (per-instruction) is owned by each instruction task; this is the cross-cutting e2e.
Dependencies: sdk. Authority: AGENTS.md §e2e suite; tests/src/setup/.
