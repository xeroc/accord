---
# accord-cbc7
title: Migrate apps/app to import evidence from @useaccord/sdk/evidence
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T13:00:00Z
parent: accord-07q3
---

Rewrite apps/app imports to the SDK; remove the local copies. Zero behavior change. DoD: apps/app builds; its evidence.test.ts passes unchanged. see milestone §5.

## Summary of Changes

Migrated every apps/app consumer of the evidence module to import from
`@useaccord/sdk/evidence`; removed the local copies. Zero behavior change.

### Prerequisite note

`accord-v2ny` (extract evidence module → SDK) had **no blocking dependency**
recorded against `accord-cbc7`, yet the migration is impossible without the
extraction (the SDK `evidence/` barrel only exported crypto/keys/ecies). The
extraction was therefore performed as part of this change and `accord-v2ny` is
marked completed by the same commit. Doing both atomically is exactly the
green-workspace guarantee AGENTS.md §Change Coupling demands.

### apps/app (migration — this bean's scope)

- `evidence/index.ts` (barrel) — re-exports `buildManifest`, `SHA256_ZERO`,
  `Manifest*` types, `generateSalt`, `deriveOptionHashes`, `verifyOptionHashes`,
  `publishEvidence`, `verifyManifestHash`, `PublishParams`, `parseManifest`,
  `optionLabels`, `ParsedManifest` from `@useaccord/sdk/evidence`.
- `evidence/config.ts` (NEW) — holds `EVIDENCE_DAEMON_URL` (Vite env), kept
  app-side so the SDK stays environment-agnostic (ADR-0011/0015).
- `EvidenceEditor.tsx`, `EvidenceManifest.tsx`, `PublishEvidence.tsx`,
  `useManifest.ts` — imports rewritten to `@useaccord/sdk/evidence` (and
  `./config` for the daemon URL). `PublishEvidence.tsx`'s duplicate local
  `EVIDENCE_DAEMON_URL` was unified onto `./config`.
- `evidence.test.ts` — the three relative module imports merged into the single
  `@useaccord/sdk/evidence` import; assertions unchanged (14/14 pass).
- Deleted `manifest.ts`, `options.ts`, `parse.ts`, `publish.ts`.

### Verification

- `pnpm --filter @useaccord/app run test` → 14/14 pass (unchanged).
- `pnpm --filter @useaccord/app run build` → ✓ built.
- `pnpm --filter @useaccord/app run lint` (tsc -b --noEmit) → clean.
- Workspace `pnpm run -r --filter "./packages/*" --filter "./apps/*" {lint,build}`
  → green.

### Pre-existing (out of scope)

`packages/canon` test fails under the full `-r test` sweep because the SDK
`test` script (`tsc -p tsconfig.json`, no `noEmit`, `outDir: ./dist`) emits
extensionless-import `.js` that clobbers tsup's correctly-bundled `dist/`, which
canon then fails to `import`. Confirmed identical on the clean committed tree —
not introduced by this change.
