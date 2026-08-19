---
# accord-c52p
title: SDK — make codegen + CreateListArgs.court + defaultCourtParams() + README
status: todo
type: task
tags:
    - implementer
created_at: 2026-08-19T18:18:13Z
updated_at: 2026-08-19T18:18:13Z
parent: accord-lkf3
---

- `anchor build --ignore-keys` + canon codegen (`packages/canon` codama) — never hand-edit `src/generated/`.
- `packages/canon/src/methods.ts`: `CreateListArgs.court: CourtParams`; add `defaultCourtParams()` export (canonical profile from milestone HANDOFF: min_stake 1_000, alpha 1_000, 7d/2d/2d/3d windows, max_appeals 3, min_jury_size 3, fee_per_juror 10, reveal_threshold 6_666, max_draw_attempts 3, depth 8). Export from `index.ts`.
- `packages/canon/README.md`: args doc updated.
