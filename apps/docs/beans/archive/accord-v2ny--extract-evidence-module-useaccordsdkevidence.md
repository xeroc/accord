---
# accord-v2ny
title: Extract evidence module → @useaccord/sdk/evidence
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T13:00:00Z
parent: accord-07q3
---

Move manifest.ts/parse.ts/options.ts/publish.ts from apps/app/src/features/dispute/evidence/ into @useaccord/sdk/evidence (public exports). Keep EVIDENCE_DAEMON_URL config app-side. DoD: module exported from SDK; types stable. see milestone §5.

## Summary of Changes

Performed as a prerequisite of `accord-cbc7` (no blocking dependency was
recorded between the two beans, and the migration is impossible without the
extraction). Both shipped in one atomic commit.

### SDK (extraction — this bean's scope)

- `packages/sdk/src/evidence/manifest.ts` (NEW) — verbatim move from apps/app;
  `buildManifest`, `SHA256_ZERO`, `ManifestInput`/`ManifestCtx`/
  `ManifestEntryInput`.
- `packages/sdk/src/evidence/options.ts` (NEW) — `generateSalt`,
  `deriveOptionHashes`, `verifyOptionHashes`; `sha256` import repointed from
  `@useaccord/sdk/evidence` to the local sibling `./crypto.js`.
- `packages/sdk/src/evidence/parse.ts` (NEW) — verbatim move; `parseManifest`,
  `optionLabels`, `ParsedManifest`.
- `packages/sdk/src/evidence/publish.ts` (NEW) — `publishEvidence`,
  `verifyManifestHash`, `PublishParams`; imports repointed to `./crypto.js` +
  `./ecies.js`. `EVIDENCE_DAEMON_URL` kept app-side (per this bean's DoD) — NOT
  moved into the SDK.
- `packages/sdk/src/evidence/index.ts` — barrel re-exports the four new modules
  alongside crypto/keys/ecies.

### Verification

- `pnpm --filter @useaccord/sdk run lint` → clean.
- `pnpm --filter @useaccord/sdk run test` → 89/89 pass.
- `pnpm --filter @useaccord/sdk run build` → evidence chunk 5.4→11.2 KB (new
  exports included); `apps/app` resolves them via the workspace `exports` map.
- Types stable: every symbol apps/app consumed is re-exported under the same
  name from `@useaccord/sdk/evidence`.
