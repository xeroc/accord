---
# accord-rc71
title: Test pipeline
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
blocked_by:
  - accord-4swo
---

---

assigned: tester
---

tests/pipeline.test.ts: ingest happy/mismatch/idempotent; deliver happy/not-drawn/premature/unknown-operator/gate-fail. Stub chain reader + in-memory store.

See milestone accord-yjno HANDOFF §6 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

- Added the canonical `apps/evidence-daemon/tests/pipeline.test.ts` per the
  SPEC module layout — one consolidated suite covering both ingest and
  deliver against a stub chain reader, in-memory `EvidenceStore`, and stub
  keyring/crypto.
- Consolidated the implementer beans' per-module TDD files
  (`ingest.test.ts`, `deliver.test.ts`) into this single `pipeline.test.ts`
  to match the SPEC layout and avoid duplication (deletion over addition).
  `watermark.test.ts` stays separate — the SPEC scopes pipeline.test.ts to
  ingest+deliver only.
- Full HANDOFF §6 matrix covered:
  ingest → happy / hash-mismatch (400) / idempotent (201 idempotent:true),
  deliver → happy (200) / premature (404, round missing) / not-drawn
  (404, juror absent from Round.jurors) / unknown-operator (404) /
  gate-fail (409, sha256 != evidence_hash).
  Plus extras: ingest 409 conflict, structural 400s, path-mismatch 400,
  dispute-not-found 404, deliver decrypt-failure 409, the watermark-seam
  propagation (a custom Watermark's tag reaches reencryptToJuror), and the
  encrypted-at-rest invariant (stored object exposes no plaintext field) for
  both paths.

Verification
------------

- `bun test apps/evidence-daemon/tests/` → 22 pass across 2 files
  (18 pipeline + 4 watermark), 0 fail.
- Source modules unchanged this bean; their typecheck (clean in
  accord-r9km / accord-4swo) holds.
- Test-file `node:*` tsc resolution awaits the scaffold's `@types/node`
  (accord-qzca); not a defect in this bean's code.

Out of scope (deliberately deferred)
------------------------------------

- crypto.test.ts (Ed↔X25519, ECIES, AES-GCM/HKDF round-trips) — lands with
  the crypto core in accord-vknh.
- e2e.test.ts (create_dispute → draw → juror fetch vs Surfpool) — epic
  accord-0t29.
