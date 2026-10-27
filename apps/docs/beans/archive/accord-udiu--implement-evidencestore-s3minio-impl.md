---
# accord-udiu
title: Implement EvidenceStore + S3/MinIO impl
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T17:00:00Z
parent: accord-xrdc
---

---

assigned: implementer
---

src/store/{store.ts,s3.ts}: trait put/get/delete/exists + S3Store. Object key {subaccord}/{dispute}, user-metadata plaintext-hash, idempotent put (HEAD then PUT/409). CIPHERTEXT ONLY — never accept/store plaintext. SSE-S3/KMS.

See milestone accord-yjno HANDOFF §2 §3 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Implemented the `EvidenceStore` trait and the v1 `S3Store` (S3/MinIO) impl for
the evidence daemon (ADR-0011, milestone accord-yjno).

**Files added** (all under `apps/evidence-daemon/`):

- `package.json` — `@accord/evidence-daemon` workspace package (private, type:
  module). Deps: `@aws-sdk/client-s3`, `@solana/kit` (for the `Address` brand).
  Scripts: `lint` = `tsc --noEmit` (matches SDK convention). Bun types in
  devDeps per SPEC ("TypeScript/Bun application").
- `tsconfig.json` — extends `../../tsconfig.base.json`, noEmit, Bun types.
- `src/store/store.ts` — `EvidenceBundle` data model (CIPHERTEXT ONLY: no
  plaintext field exists, by type construction), `EvidenceStore` trait
  (put/get/delete/exists), `EvidenceConflictError` (→ HTTP 409 on hash clash),
  and the JSON+base64 serialization helpers (`serializeBundle` /
  `deserializeBundle` / `bytesToBase64` / `base64ToBytes` / `hashEquals`).
  `address()` from `@solana/kit` brands deserialized base58 strings.
- `src/store/s3.ts` — `S3Store implements EvidenceStore`:
  - Object key `{subaccord}/{dispute}` (base58 Address strings).
  - User metadata: `plaintext-hash` (base64), `subaccord`, `ingested-at`.
  - Idempotent `put`: `HeadObject` → equal hash no-op, different hash raises
    `EvidenceConflictError`, absent metadata (foreign object) raises conflict,
    missing key falls through to `PutObject`. Race window between HEAD and PUT
    is documented as accepted (one dispute ⇒ one plaintext in the protocol).
  - SSE-S3 (`AES256`, default) or SSE-KMS (`aws:kms`, requires `kmsKeyId`) —
    defense-in-depth; body is already application-level ciphertext.
  - `get` returns `null` on `NoSuchKey` / `NotFound` (MinIO variant).
  - `delete` is idempotent (S3 delete of a missing key is 204).
  - `exists` is a `HeadObject` probe.

**Verification:** `pnpm --filter @accord/evidence-daemon run lint` green;
`make lint` green across the workspace. Tests for `S3Store` (round-trip,
idempotency, conflict, never-plaintext invariant) live in the sibling bean
`accord-3u1e` — deliberately not duplicated here. The serialization helpers
and `address()` re-branding are pure and exercised transitively by that suite.

**Skipped (deliberately, YAGNI / out of this bean):**

- Streaming decrypt/re-encrypt for large evidence — body is buffered as one
  JSON string. The `EVIDENCE_MAX_EVIDENCE_BYTES` cap is enforced at the HTTP
  layer (separate bean).
- Conditional `PutObject` (`If-None-Match`) for race-free idempotency — S3
  conditional puts don't check metadata and the protocol invariant (one
  dispute ⇒ one plaintext) makes the HEAD-then-PUT race benign. Documented
  inline with a `ponytail:` comment.
- CBOR — JSON+base64 needs no extra dep and the body is ciphertext anyway.
- Per-Juror watermarking — v1.1 (bean `accord-1acp`).
