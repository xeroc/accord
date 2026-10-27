---
# accord-xw8r
title: Fix broken build + test pipeline (evidence-daemon tsconfig, stale post-ADR-0012 specs)
status: completed
type: bug
priority: critical
created_at: 2026-08-06T04:56:07Z
updated_at: 2026-08-06T14:15:58Z
---

Two breakages block the dev pipeline:

1. `pnpm run -r build` fails: `apps/evidence-daemon` has no `tsconfig.json` (build script `tsc -p tsconfig.json --noEmit` → TS5058). Scaffolding omission.

2. `make test_surfpool` fails:
   - 5 specs (`appeal`, `dispute`, `sdk-pipeline`, `staking`, `voting`) reference the pre-ADR-0012 snapshot API (`buildMst`, `postSnapshot`, `finalizeSnapshot`, `draw`, `findSnapshotPda`, `resolvePanel`, `MerkleSumTree`) deleted in commit e9c8504. They no longer compile.
   - 6 specs (`accumulator`, `draw`, `full-lifecycle`, `lifecycle.*`) target the new accumulator API and typecheck clean — they only need a running Surfpool.

## TODO

- [x] Add `apps/evidence-daemon/tsconfig.json` → `pnpm run -r build` green

Stale-spec strategy (decided): rewrote all 5 specs to the ADR-0012 accumulator
API rather than removing them — preserves per-instruction edge-case coverage
(auth failures, timelocks, guards). Confirmed all 6 clean specs + the 5
rewrites pass against a fresh Surfpool.

## Summary of Changes

`pnpm run -r build` and `make test_surfpool` both GREEN (11/11 suites, 36/36 tests on a fresh Surfnet).

See the commit for the full breakdown (program-id unification, evidence-daemon tsconfig, 5 stale spec rewrites, harness fixes).
