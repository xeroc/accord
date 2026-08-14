---
# accord-q8ns
title: SDK — regenerate @useaccord/canon + closeItem facade
status: todo
type: task
priority: normal
created_at: 2026-08-14T19:06:45Z
updated_at: 2026-08-14T19:07:16Z
parent: accord-xztg
blocked_by:
    - accord-kmz6
---

---

assigned: implementer
---

After the program change lands: regenerate the Codama client (`make codegen` — canon has its own `codama.json` under `packages/canon`), add a `closeItem` facade method mirroring the existing facade method shape, reusing the existing canon-item PDA helper. Grep `close_item|closeItem` across `apps/` and `tests/` for consumers needing migration (expected: none besides new specs). Never hand-edit `src/generated/`.

## Acceptance criteria

- [ ] regenerated client contains `close_item` (committed, not hand-edited)
- [ ] `closeItem` exported from the `@useaccord/canon` public surface
- [ ] `make codegen && pnpm -r run build` green workspace-wide
- [ ] `pnpm --filter @useaccord/canon lint` green (where defined)
