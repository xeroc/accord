---
# accord-c52p
title: SDK — make codegen + CreateListArgs.court + defaultCourtParams() + README
status: completed
type: task
tags:
    - implementer
created_at: 2026-08-19T18:18:13Z
updated_at: 2026-08-19T18:18:13Z
parent: accord-lkf3
---

- `anchor build --ignore-keys` + canon codegen (`packages/canon` codama) — never hand-edit `src/generated/`.
- `packages/canon/src/methods.ts`: `CreateListArgs.court: CourtParams`; add `defaultCourtParams()` export (canonical profile from milestone HANDOFF: min_stake 1_000, alpha 1_000, 7d/2d/2d/3d windows, max_appeals 3, min_jury_size 3, fee_per_juror 10, reveal_threshold 6_666, max_draw_attempts 3, depth 8). Export from `index.ts`.

## Summary of Changes

- Merged program-side CourtParams (accord-n9wi @ 4b33958) into the lane; `anchor build --ignore-keys` + canon codama codegen regenerated `src/generated/` (createList instruction data + AlphaTooHigh/WindowTooShort/TreeDepthTooDeep error codes) — no hand edits.
- `packages/canon/src/methods.ts`: `CourtParams` interface (12 fields) + `CreateListArgs.court: CourtParams` + `defaultCourtParams()` canonical profile; facade spreads `...args.court` into the generated builder; exported from `index.ts`.
- `packages/canon/README.md`: createList args doc (incl. `evidenceOperator` + `court`) + `defaultCourtParams()` documented.
- Caller cutover (repo §Change Coupling): `apps/canon` CreateListPage passes `defaultCourtParams()`; `tests/src/canon.{spec,challenge.spec}.ts` call sites pass `court: defaultCourtParams()`; stale "depth 20" comments fixed (`canon.challenge.spec.ts`, `draw-harness.ts` — actual depth is 8).
- `canon.smoke.test.ts`: defaultCourtParams canonical-profile invariant test.
- Verified: `pnpm -r run build` green workspace-wide, `pnpm -r run lint` green, `@useaccord/canon` tests 3/3, canon-app builds, tests/ tsc clean. Surfpool e2e with explicit profiles is accord-fi07 (blocked on this bean).
