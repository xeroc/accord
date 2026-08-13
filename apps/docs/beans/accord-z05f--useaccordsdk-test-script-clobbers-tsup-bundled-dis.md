---
# accord-z05f
title: '@useaccord/sdk test script clobbers tsup-bundled dist — breaks workspace ''pnpm -r test'''
status: draft
type: task
created_at: 2026-08-13T03:29:18Z
updated_at: 2026-08-13T03:29:18Z
---

## Problem

`pnpm run -r --filter "./packages/*" --filter "./apps/*" test` (a mandated CI
gate per AGENTS.md §Workflow tests) fails in `@useaccord/canon`'s smoke test
with `ERR_MODULE_NOT_FOUND: Cannot find module '.../packages/sdk/dist/accord'`.

Root cause is in `packages/sdk` (not canon):

1. `@useaccord/sdk` `build` = `tsup && tsc --emitDeclarationOnly`. tsup
   (`splitting`, entry `index` + `evidence/index`) emits a clean, self-contained
   package-importable `dist/index.js` (imports its chunk with a `.js` extension).
2. `@useaccord/sdk` `test` = `tsc -p tsconfig.json && node --test src/**/*.test.ts`.
   The bare `tsc -p tsconfig.json` does a FULL emit (tsconfig has `outDir: dist`,
   no `noEmit`), producing per-file `dist/accord.js`, `dist/methods/*.js`, etc.
   Its own tests import those (`../../dist/methods/staking.js`), so the full emit
   is load-bearing for the SDK's own test run — but it ALSO overwrites tsup's
   clean `dist/index.js` with extensionless tsc ESM (`export { Accord } from
   "./accord"`), which Node ESM cannot resolve.
3. Under `pnpm -r test`, topological order runs `@useaccord/sdk` test FIRST
   (clobbering dist), then `@useaccord/canon` test, whose smoke test imports
   `@useaccord/sdk` → resolves to the now-broken `dist/index.js` → fails.

`pnpm --filter @useaccord/sdk run build` alone produces a clean, working dist,
so the SDK is fine in isolation; the conflict only surfaces in the recursive
workspace `test` gate.

## Why draft / out of scope of the discovering bean

Discovered while verifying accord-etf5 (canon withdrawal flow). packages/sdk was
untouched by that work. The fix needs a design decision on the SDK's test/dist
strategy — e.g. one of:

- (a) `test` uses `--noEmit` typecheck + run tests against `src` via `tsx`
  (matches the apps + canon SDK which run `node --import tsx --test`),
  removing the dist dependency entirely;
- (b) `test` emits to a separate outDir (e.g. `.test-dist`) so it never
  clobbers the package `dist`;
- (c) `build` runs (tsup) as the last step of CI before `test`, and `test`
  never re-emits dist.

Any of these is a packages/sdk change that should be reviewed on its own, not
folded into a withdrawal-flow task.

## DoD

`pnpm run -r --filter "./packages/*" --filter "./apps/*" test` is green
end-to-end without a manual `pnpm --filter @useaccord/sdk run build` first.
