---
# accord-qzca
title: Scaffold @accord/evidence-daemon app
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T16:55:00Z
parent: accord-djso
---

---

assigned: implementer
---

apps/evidence-daemon: package.json (private, bun), tsconfig extends ../../tsconfig.base.json, eslint/prettier, src/ dir layout per SPEC module map, empty Dockerfile stub. pnpm-workspace already globs apps/*.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Scaffolded the `@accord/evidence-daemon` workspace package (ADR-0011 / SPEC §Module layout). No logic — stubs only, each carrying a doc-comment that points to its sibling-bean implementer.

- `package.json` — `@accord/evidence-daemon` (private, `type: module`, bun scripts:
  build/lint/lint:fix/start/test/clean); `@accord/sdk` workspace dep; eslint/prettier/typescript/@types/bun devDeps.
- `tsconfig.json` — extends `../../tsconfig.base.json`; `outDir`/`rootDir`, `lib: ["ES2020"]`, `types: ["bun"]`.
- `eslint.config.js` — flat config: @eslint/js + typescript-eslint recommended + prettier recommended; ignores dist/node_modules.
- `.prettierrc.json` + `.prettierignore` — printWidth 100, trailingComma all.
- `Dockerfile` — minimal Bun runtime stub (marked `ponytail:` for deploy-time hardening: non-root user, HEALTHCHECK, multi-stage, env injection).
- `src/` — 15 module stubs matching the SPEC module map 1:1:
  `config`, `keys/{ed25519,keyring}`, `crypto/{ecies,symmetric}`,
  `store/{store,s3}`, `chain/{reader,events}`, `pipeline/{ingest,deliver,watermark}`,
  `server/{app,routes}`, `main`.
- `tests/.gitkeep` — dir reserved for the test beans (accord-c07y et al.).
- `pnpm-lock.yaml` — updated by `pnpm install` to record the new workspace package + deps.

Verification:

- `pnpm install` — clean (workspace `@accord/sdk` resolves).
- `pnpm --filter @accord/evidence-daemon run lint` — clean.
- `pnpm --filter @accord/evidence-daemon run build` (tsc --noEmit) — clean.

Scope boundary: stubs establish layout only. Implementation is deferred to
accord-vknh (crypto), accord-11im (config + EnvKeyring), and the store/chain/
pipeline/server beans under the Crypto & Foundation epic.
