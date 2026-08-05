---
# accord-r9km
title: Implement ingest handler (POST)
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
---

---

assigned: implementer
---

src/pipeline/ingest.ts: POST /evidence/{subaccord}/{dispute}. Validate plaintext_hash==Dispute.evidence_hash, store.put (idempotent 201/409). Reject bad bundles (400).

See milestone accord-yjno HANDOFF §1 §4 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

- Added `apps/evidence-daemon/src/pipeline/ingest.ts`: the pure ingest pipeline
  `ingest(subaccord, dispute, bundle, deps)` plus its ports and types. Owns no
  I/O — `IngestStore` and `IngestChainReader` are injected (the real `S3Store`
  in accord-xrdc and chain reader in accord-mwfq will satisfy them).
- v1 scope implemented: structural 400s (bad pubkey sizes, empty ct/wrapped,
  wrong plaintext_hash length), path/bundle/chain consistency checks, metadata
  integrity (`bundle.plaintext_hash == Dispute.evidence_hash`), idempotent
  `store.put` (201 new / 201 idempotent on same hash / 409 on different hash),
  and 404 when the dispute is not on-chain. `ingested_at` is stamped
  server-side (client value ignored) so claimants cannot forge timing.
- Exports the `EvidenceBundle` shape (SPEC data model, ciphertext-only — no
  plaintext field) for reuse; store.ts will adopt/share it when it lands.
- Added `apps/evidence-daemon/tests/ingest.test.ts`: 12 green checks with an
  in-memory `EvidenceStore` and a stub chain reader — happy, idempotent
  re-put (no duplicate), 409 conflict, metadata mismatch, structural 400s,
  path mismatch, dispute-subaccord mismatch, 404 not-found, and the
  encrypted-at-rest invariant (stored object has no plaintext field).

Verification
------------

- `ingest.ts` typechecks clean standalone (`tsc --noEmit --strict`, exit 0).
- Tests green: `bun test apps/evidence-daemon/tests/ingest.test.ts` → 12 pass.
- Test-file `node:*` tsc resolution awaits the scaffold's `@types/node`
  (accord-qzca); not a defect in this bean's code.

Out of scope (deliberately deferred)
------------------------------------

- Decrypt-and-verify gate at ingest (`sha256(plaintext) == evidence_hash`,
  ciphertext decryptability) — needs crypto (accord-vknh) + keyring
  (accord-11im). The mandatory integrity gate runs at delivery (deliver.ts);
  ingest does metadata-only validation per SPEC happy-path step 2.
- HTTP/route wiring (Hono) — server epic (accord-s3ow); routes.ts calls
  `ingest()` after base58-decoding the path params and request body.
- Canonical home of `EvidenceBundle` — review bean (accord-2ixp) may relocate
  to a shared types module once store.ts lands.
