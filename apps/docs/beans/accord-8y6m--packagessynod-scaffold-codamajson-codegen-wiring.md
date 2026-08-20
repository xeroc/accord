---
# accord-8y6m
title: packages/synod scaffold + codama.json + codegen wiring
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:54:05Z
parent: accord-e4up
---

assigned: implementer
Mirror packages/canon package shape exactly (name @useaccord/synod, tsconfig, scripts incl. lint/build/test for the CI workflow). codama.json from the synod IDL emitted by anchor build. Extend the Makefile codegen target the way canon is wired. Verify: make codegen regenerates src/generated from the IDL; generated code never hand-edited. See milestone accord-oylq HANDOFF §2.

## Summary of Changes

- `packages/synod/` scaffolded mirroring `packages/canon` exactly: `package.json` (`@useaccord/synod`, same scripts incl. lint/build/test/codegen, same deps), `tsconfig.json`, `tsup.config.ts` (ESM bundle rationale), `README.md` (marked scaffold — facade pending), `pnpm-workspace.yaml` already covers `packages/*`.
- `packages/synod/codama.json` → `../../target/idl/synod.json`, same renderer args as canon (`syncPackageJson: false`, `kitImportStrategy: rootOnly`, `@solana/kit ^7.0.0`).
- `make codegen` now also runs `codama run js` in `packages/synod` (canon remains per-package via its own `codegen` script, unchanged).
- `src/index.ts` re-exports the raw Codama client only — honest stub; the hand-written facade (pda/methods/fetch) is sibling bean accord-nsxa. `src/synod.smoke.test.ts` asserts `SYNOD_PROGRAM_ADDRESS` === `declare_id!` placeholder (one runnable check of the IDL→codegen wiring).
- `src/generated/` is committed Codama output (empty-instruction stub IDL → `errors/` + `programs/` only); never hand-edited — regenerate via `make codegen`.
- Verified: `anchor build --ignore-keys` emits `target/idl/synod.json`; `make codegen` regenerates `packages/synod/src/generated`; `pnpm -r --filter "./packages/*" lint|build|test` all green (sdk 97, canon 2, synod 1 tests pass).
- Lockfile updated (`pnpm install --no-frozen-lockfile`) to register the new workspace package.
