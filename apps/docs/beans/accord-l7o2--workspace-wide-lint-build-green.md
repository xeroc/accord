---
# accord-l7o2
title: Workspace-wide lint + build green
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T02:08:01Z
parent: accord-5t0a
---

`make codegen && pnpm -r run build` and the apps/packages lint all pass. DoD: no regressions in apps/app after the evidence extraction. see milestone §5 DoD.

## Summary of Changes

No code changes required — the workspace was already green. Verified the full DoD
on branch `accord-5t0a` (clean worktree):

- `make codegen` → exit 0, **zero diff** to committed generated code
  (`packages/sdk/src/generated/` is current; both `accord` + `canon` programs
  compile, canon LiteSVM Rust unit tests run, Codama client regenerates clean).
- `pnpm -r run build` → exit 0, all 7 workspace projects green
  (sdk, canon, cranker, evidence-daemon, cli, app, landing).
- `pnpm run -r --filter "./packages/*" --filter "./apps/*" lint` → exit 0, all 7 green.
- **No apps/app regressions** after the evidence extraction: `apps/app` test
  suite 14/14 pass (buildManifest / deriveOptionHashes / verifyManifestHash /
  publishEvidence). `apps/app` already imports `sha256` from
  `@useaccord/sdk/evidence`; the manifest protocol remains local to
  `apps/app/src/features/dispute/evidence/` (extraction of builder/parser/
  publisher into the SDK is E2's scope, not yet landed — not a regression).
- SDK evidence tests all pass (sha256, hkdf, AES-256-GCM, ECIES ingest/deliver,
  Ed↔X25519) — the extracted crypto surface is intact.
- `apps/cli` 115/115, `packages/canon` 3/3 (when the SDK ships its tsup-built
  dist, see discovered issue below).

### Discovered (filed as draft bean accord-2rbv, not in this bean's scope)

Aggregate `pnpm -r run test` fails in `packages/canon` with
`Cannot find module '.../packages/sdk/dist/accord'`. Root cause: the SDK `test`
script runs `tsc -p tsconfig.json`, whose extensionless-ESM output
(`from "./accord"`) clobbers the valid tsup-bundled `dist/` that canon's raw
`node --test` then cannot import. Proven ordering-only (not a code defect, not
an evidence-extraction regression, not in apps/app): running the SDK `build`
(tsup) before canon's test → canon 3/3 pass. Pre-existing — re-introduced by
commit a753f12. Fix candidate logged in accord-2rbv.
