---
# accord-xdtn
title: e2e — canon.challenge.spec passes explicit court profile + stale depth-20 comments fixed
status: todo
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
