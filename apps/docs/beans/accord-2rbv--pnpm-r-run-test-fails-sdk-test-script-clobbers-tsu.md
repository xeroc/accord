---
# accord-2rbv
title: 'pnpm -r run test fails: SDK test script clobbers tsup dist'
status: completed
type: bug
priority: normal
created_at: 2026-08-13T03:56:43Z
updated_at: 2026-08-14T19:10:16Z
---

Aggregate `pnpm -r run test` (the CI lane per AGENTS.md workflow) fails in `packages/canon` with `Cannot find module '.../packages/sdk/dist/accord'`.

Root cause: `packages/sdk` test script is `tsc -p tsconfig.json && node --test src/**/*.test.ts`. The `tsc` step emits extensionless-ESM into `dist/` (e.g. `export { Accord } from "./accord"`), overwriting the valid tsup-bundled dist produced by the `build` script. `packages/canon` test then runs raw `node --test` (Node ESM, requires explicit `.js` extensions) and fails to resolve the SDK.

Proof it is ordering-only, not a code defect: `pnpm --filter @useaccord/sdk run build && pnpm --filter @useaccord/canon run test` → 3/3 pass. apps/app (14/14), apps/cli (115), SDK evidence tests all green.

Discovered during accord-l7o2 (workspace green gate). Pre-existing — predates the evidence extraction; commit a753f12 (`fix(sdk): restore dist emit in test script`) re-introduced the tsc emit. Not in apps/app, not a regression.

Candidate fixes (pick one): (a) SDK test: `tsc -p tsconfig.json --noEmit && node --test ...` (typecheck without emitting dist); (b) SDK test: emit to a throwaway outDir, not dist/; (c) canon test: depend on the tsup build instead of consuming whatever dist state exists.
