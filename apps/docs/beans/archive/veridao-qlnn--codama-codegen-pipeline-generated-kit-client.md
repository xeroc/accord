---
# veridao-qlnn
title: Codama codegen pipeline + generated Kit client
status: completed
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-05T00:30:00Z
parent: veridao-vxe9
---

Set up the codegen pipeline. Add `codama` CLI + `@codama/renderers-js` to packages/sdk devDeps. Create packages/sdk/codama.json: `{ "idl": "../../target/idl/accord.json", "scripts": { "js": ["@codama/renderers-js"] } }`. Add `make codegen` (anchor build -> codama run js) and `make sdk` targets to Makefile. Run `make codegen` to emit packages/sdk/src/generated/. Acceptance: `make codegen` produces the Kit client (codecs, Ix builders, account fetchers) with no manual edits; a generated instruction builder imports and resolves under tsc. See ADR-0010.

## Summary of Changes

- **packages/sdk/package.json**: Added `@solana/kit@^7.0.0` (runtime dep for generated
  Kit client); added `codama@^1.10.0`, `@codama/renderers-js@^2.3.1`,
  `@codama/nodes-from-anchor@^1.5.3` as devDeps.
- **packages/sdk/codama.json**: Codama config pointing at `target/idl/accord.json`.
  Uses `renderVisitor(".", { syncPackageJson: false, kitImportStrategy: "rootOnly" })`
  so generated code lands at `src/generated/` without overwriting the SDK package.json
  and imports exclusively from `@solana/kit` (no granular `@solana/*` deps needed).
- **Makefile**: Added `codegen` (anchor build -> pnpm exec codama run js) and `sdk`
  (pnpm run build) targets; registered both in `.PHONY`.
- **packages/sdk/src/generated/**: 55 generated files (accounts, errors, instructions,
  pdas, programs, types) — committed, regen via `make codegen`. No manual edits.
- **pnpm-lock.yaml**: Updated for new deps.

### Verification

- `anchor build --ignore-keys` emits `target/idl/accord.json` (24 instructions,
  canonical address `RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe`).
- `codama run js` generates the full Kit client tree.
- `make lint` (tsc --noEmit) exits 0 — all generated imports resolve under `@solana/kit`.
- `make sdk` (tsc build) exits 0 — `dist/generated/` emitted.

### Note

`make codegen` uses bare `anchor build` (no `--ignore-keys`). This worktree's local
keypair (`target/deploy/accord-keypair.json`, gitignored) was freshly generated and
doesn't match the canonical program ID — use `anchor build --ignore-keys` locally or
run `anchor keys sync` if the canonical keypair isn't provisioned. The canonical
keypair produces `RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe`; the IDL's `address`
field always reflects `declare_id!` regardless.
