---
# accord-6fgl
title: "Test: dispute-detail Publish evidence recovery — hash gate + idempotent re-publish"
status: completed
type: task
created_at: 2026-08-11T00:56:38Z
updated_at: 2026-08-11T05:45:00Z
parent: accord-wbic
blocked_by:
  - accord-9df9
---

Upload matching manifest → verifyManifestHash passes → publishEvidence 201. Upload wrong manifest → hash mismatch → rejected. Re-publish already-published → 201 idempotent. See HANDOFF §6.

## Summary of Changes

Added a `bun test` suite for the recovery flow (`features/dispute/evidence/publish.test.ts`),
covering the three behaviors the detail-page "Publish evidence" upload relies on
(HANDOFF §6). The app previously had no test runner; added `bun test` (the
daemon's existing runner) so the suite is runnable + type-checked.

### Files

- **NEW** `apps/app/src/features/dispute/evidence/publish.test.ts` — 6 tests:
  - **`verifyManifestHash`** — matching manifest passes; wrong manifest is
    rejected; single-byte tamper is rejected (fails closed).
  - **`publishEvidence` happy path** — POSTs to
    `/evidence/{subaccord}/{dispute}` with the four base64 body fields
    (`ct`, `claimant_ephem_pub`, `wrapped`, `plaintext_hash`); asserts
    `plaintext_hash == sha256(manifest)` (the on-chain evidence_hash the
    daemon cross-checks at `ingest.ts:142-144`).
  - **`publishEvidence` non-201** — a `500` response throws.
  - **re-publish (idempotent at the call site)** — calling `publishEvidence`
    twice with the same manifest succeeds (two `201` POSTs); both POSTs carry
    an identical `plaintext_hash` (the daemon dedupes on it; app-side the call
    must not throw on the second POST).
- `apps/app/package.json` — added `"test": "bun test"` script and
  `"@types/bun": "^1.3.0"` devDependency (mirrors `apps/evidence-daemon`).
- `apps/app/tsconfig.json` — added `"bun"` to `types` (so `bun:test` resolves
  under `tsc --noEmit`).
- `pnpm-lock.yaml` — `@types/bun` importer entry.

### Approach

- `fetch` is mocked (no live daemon / chain); daemon-side idempotency and the
  on-chain hash cross-check are owned by `apps/evidence-daemon`'s own suite
  (`s3.test.ts` idempotency on `plaintextHash`, `app.test.ts` 201/409 mapping).
- The operator pubkey is generated via the SDK's `ed25519PublicKeyFromSeed`
  (already exported from `@useaccord/sdk/evidence`) — no `@noble/curves` added
  to the app; round-trips through `getAddressDecoder`/`getAddressEncoder`.
- The component (`PublishEvidence.tsx`) is thin glue (file input → call these
  functions → render result); all testable logic lives in `publish.ts`.

### Verification

- `pnpm --filter @useaccord/app run test` — **6 pass, 0 fail** (18 expects).
- `pnpm --filter @useaccord/app run lint` — green (tsc --noEmit, incl. the test file).
- `make lint` — green across all 8 workspace projects.
- `pnpm -r run build` — green.
