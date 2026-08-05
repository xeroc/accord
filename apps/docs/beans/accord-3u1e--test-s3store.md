---
# accord-3u1e
title: Test S3Store
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T15:45:00Z
parent: accord-xrdc
blocked_by:
  - accord-udiu
---

---

assigned: tester
---

put/get round-trip, idempotency (same hash no-op, different hash 409), missing→null, never-plaintext invariant (object body is ciphertext). Use MinIO testcontainer or S3 mock.

See milestone accord-yjno HANDOFF §5 §6 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Added `apps/evidence-daemon/src/store/s3.test.ts` (bun:test) — 12 tests, all green,
covering the full S3Store matrix from the bean:

- **put/get round-trip** — put then get returns an equal bundle; byte fields
  (`ct`, `wrapped`, `claimantEphemPub`, `plaintextHash`) round-trip exactly.
- **idempotency, same hash → no-op** — a re-PUT with equal `plaintextHash` does
  not error and does NOT rewrite the object (original `ingestedAt` preserved,
  byte-identical body).
- **idempotency, different hash → 409** — re-PUT with a different hash throws
  `EvidenceConflictError` carrying the existing hash + coordinates.
- **missing → null** — `get`/`exists` on an absent key return `null`/`false`.
- **never-plaintext invariant** — the persisted object body is byte-identical to
  `serializeBundle(bundle)`, contains no plaintext sentinel, has exactly the
  ciphertext JSON schema (no `plaintext` key), and the stored `ct` round-trips
  to the exact ciphertext bytes.
- **exists / delete** — `exists` flips false→true after put; `delete` is
  idempotent (missing-key delete is a no-op; post-delete get → null).
- **bonus branch cover** — an object present _without_ our `plaintext-hash`
  metadata is treated as a conflict (defensive `HEAD` branch).

Approach: faithful in-memory S3 mock (the bean's sanctioned "MinIO testcontainer
OR S3 mock" alternative — deterministic, no docker). The mock replicates the S3
semantics S3Store depends on (metadata lowercasing, `NotFound` on missing HEAD,
`NoSuchKey` on missing GET, `Body.transformToString`), and throws the REAL
`@aws-sdk/client-s3` error classes so the store's `instanceof` branches are
exercised against genuine SDK identity.

Also added a `test` script (`bun test`) to `apps/evidence-daemon/package.json`.

Verification:

- `pnpm --filter @accord/evidence-daemon run lint` → clean (tsc --noEmit).
- `bun test` → 12 pass, 0 fail.
