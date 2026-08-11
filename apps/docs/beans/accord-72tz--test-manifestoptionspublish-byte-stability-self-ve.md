---
# accord-72tz
title: "Test: manifest/options/publish — byte-stability, self-verify, publish idempotency, verifyManifestHash accept/reject"
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T05:50:00Z
parent: accord-1d3i
blocked_by:
  - accord-2z1v
  - accord-t44l
---

node:test unit suite. See HANDOFF §6 test matrix. Cover: identical input → byte-identical buffer+sha256; verifyOptionHashes pass + tampered-label throw; publishEvidence stubbed-fetch 201 + retry idempotency; verifyManifestHash accept + reject.

## Summary of Changes

- `apps/app/src/features/dispute/evidence/evidence.test.ts` — 14 node:test cases covering: buildManifest byte-stability (identical input → identical buffer + sha256, different salt → different buffer, SHA256_ZERO sentinel, YAML sentinel presence), deriveOptionHashes + verifyOptionHashes (correct pass, tampered-label throw, length-mismatch throw, invalid-salt-length throw), verifyManifestHash (accept on match, reject on mismatch), publishEvidence (stubbed-fetch 201 with URL/body verification, retry idempotent 201, non-201 throws with daemon error detail).
- `apps/app/package.json` — added `"test"` script (`node --import tsx --test`) and `tsx` devDependency (handles `.js`→`.ts` import resolution for Node's type-stripping mode).
- `apps/app/tsconfig.json` — excluded `src/**/*.test.ts` from the build typecheck (matching SDK pattern; tests run via `node --test`, not Vite).
- All 14 tests pass; typecheck clean; workspace build green.
