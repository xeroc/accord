---
# accord-xdtn
title: e2e — canon.challenge.spec passes explicit court profile + stale depth-20 comments fixed
status: completed
type: task
tags:
    - tester
created_at: 2026-08-19T18:18:14Z
updated_at: 2026-08-19T18:18:14Z
parent: accord-fi07
---

- `tests/src/canon.challenge.spec.ts`: `createList` call passes an explicit `CourtParams` (custom windows so the warp-split actually exercises them); arm jurors at the matching depth.
- Fix stale comments claiming "depth 20": `canon.challenge.spec.ts:77` + `tests/src/setup/draw-harness.ts:287` (actual: 8).
- `apps/canon/src/features/list/CreateListPage.tsx`: pass `defaultCourtParams()`.
- Green rule: `make test` (full Rust + LiteSVM + jest e2e on Surfpool).

## Summary of Changes

- `tests/src/canon.challenge.spec.ts` test 1: explicit `CourtParams` (review 1h / commit 10m / reveal 10m / appeal 1h — Accord's `MIN_APPEAL_WINDOW_SECS` floor rejects anything shorter, caught live) with jurors armed at `court.depth`; appeal-window warp now uses `court.appealWindow` instead of `DEFAULT_APPEAL_WINDOW_SECS`. Test 2 (Failed-dispute) passes `defaultCourtParams()` and arms at its depth.
- `tests/src/canon.spec.ts` settle-remove path: passes `court: defaultCourtParams()` (required arg after accord-c52p).
- Stale "depth 20" comments fixed in `canon.challenge.spec.ts` + `draw-harness.ts` (actual: 8, via `defaultCourtParams()`).
- `apps/canon` `CreateListPage.tsx`: passes `court: defaultCourtParams()`.
- Verified: `pnpm -r run build` green, `make lint` green, full jest e2e 25/25 suites (108/108 tests) on Surfpool with the custom profile, Rust unit + LiteSVM green under `make test`.
