---
# accord-q3l5
title: 'e2e — canon.spec.ts: close Removed item + re-submit after close (Surfpool green)'
status: todo
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-14T19:07:16Z
parent: accord-k4co
blocked_by:
    - accord-q8ns
---

---

assigned: tester
---

Extend `tests/src/canon.spec.ts` (Surfpool + jest + SDK facade; harness rules in AGENTS §e2e — `setup/` modules, `fetchDecoded`, no facade fetchers). Cover BOTH terminal paths into `Removed`:

## Acceptance criteria

- [ ] settle-remove path → SDK `closeItem` → item account no longer decodes (closed) + closer SOL balance increased by the account's rent lamports
- [ ] advance_withdrawal path → `closeItem` → same assertions
- [ ] `NotRemoved` revert covered e2e (attempt close on a `Listed` item)
- [ ] re-submit the same `account` after close → fresh `CanonItem` at the same PDA, `Pending`, fresh deposit, `challenge_count == 0`
- [ ] whole `canon.spec.ts` GREEN via `make test` (never skipped locally)
- [ ] Summary of Changes section on completion
