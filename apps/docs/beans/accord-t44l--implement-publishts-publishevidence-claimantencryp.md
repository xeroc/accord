---
# accord-t44l
title: Implement publish.ts (publishEvidence = claimantEncrypt + POST; verifyManifestHash)
status: completed
type: task
created_at: 2026-08-11T00:56:37Z
updated_at: 2026-08-11T05:40:00Z
parent: accord-1d3i
---

publishEvidence uses claimantEncrypt from @useaccord/sdk/evidence, POSTs {ct,claimant_ephem_pub,wrapped,plaintext_hash} (base64) to POST /evidence/{subaccord}/{dispute}. verifyManifestHash gates the detail-page upload. See HANDOFF §4.

## Summary of Changes

- `apps/app/src/features/dispute/evidence/publish.ts` — `publishEvidence(args)`: encrypts manifest via `claimantEncrypt` (`@useaccord/sdk/evidence`), base64-encodes each bundle field, POSTs to `POST /evidence/{subaccord}/{dispute}`. Throws on non-201 with daemon error detail. Idempotent on retry (daemon returns 201 on matching plaintext_hash). `verifyManifestHash`: re-exports SDK's `verifyIntegrity` (same operation — sha256 equality check, already implemented and tested). `PublishEvidenceArgs` type.
- `apps/app/src/features/dispute/evidence/index.ts` — added `publishEvidence`, `verifyManifestHash`, `PublishEvidenceArgs` to barrel.
- Zero new deps: uses `claimantEncrypt` + `verifyIntegrity` from `@useaccord/sdk/evidence`, native `fetch` + `btoa`.
- `pnpm -r run build` + app typecheck green.
