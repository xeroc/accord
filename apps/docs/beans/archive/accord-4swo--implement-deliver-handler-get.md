---
# accord-4swo
title: Implement deliver handler (GET)
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
blocked_by:
  - accord-r9km
  - accord-oegd
---

---

assigned: implementer
---

src/pipeline/deliver.ts: GET /evidence/{dispute}/for/{juror}. store.get → keyring.forOperator → drawn check → decrypt in-memory → integrity gate → Watermark.apply → re-encrypt to juror → {out,operator_ephem_pub}. Unknown operator/not-drawn/premature → 404; gate fail → 409.

See milestone accord-yjno HANDOFF §1 §4 §3 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

- Added `apps/evidence-daemon/src/pipeline/deliver.ts`: the pure delivery
  pipeline `deliver(dispute, juror, deps)`. Orchestrates: readDispute →
  readSubaccord → keyring.forOperator → store.get → readRound/drawn-check →
  in-memory decrypt → integrity gate → Watermark.apply → reencryptToJuror.
- Auth/404 gates run before any plaintext is touched (defense in depth):
  unknown operator, missing dispute/subaccord/bundle, not-yet-drawn (round
  missing), and juror-not-in-`Round.jurors[]` all → 404. The `Round` account
  is authoritative for the drawn set (covers "premature" too).
- Integrity gate (`sha256(plaintext) == evidence_hash`) and undecryptable /
  tampered bundles → 409. Returns `{ out, operator_ephem_pub }` (200),
  re-encrypted to the juror's X25519 key; pull + no-auth is safe because the
  returned `out` is decryptable only by the juror key (ADR-0006).
- Owns no I/O: `DeliverStore`, `DeliverChainReader`, `Keyring`,
  `DeliveryCrypto`, and `Watermark` are injected ports. `Watermark` defaults
  to `NoOpWatermark` (accord-oegd) so the v1.1 seam (accord-1acp) is live — a
  custom Watermark's output is proven to reach `reencryptToJuror`.
- Reuses `EvidenceBundle` from ingest.ts and `Watermark`/`NoOpWatermark` from
  watermark.ts (no duplication).
- Added `apps/evidence-daemon/tests/deliver.test.ts`: 11 green checks with
  stub chain/keyring/crypto and an in-memory store — happy 200, every 404
  path, integrity-gate 409, decrypt-failure 409, watermark-seam propagation,
  and the encrypted-at-rest invariant (store object has no plaintext field).

Verification
------------

- `watermark.ts`, `ingest.ts`, `deliver.ts` typecheck clean together
  (`tsc --noEmit --strict`, exit 0).
- `bun test apps/evidence-daemon/tests/` → 27 pass across 3 files (no
  regression to watermark/ingest).
- Test-file `node:*` tsc resolution awaits the scaffold's `@types/node`
  (accord-qzca); not a defect in this bean's code.

Out of scope (deliberately deferred)
------------------------------------

- Real crypto primitives (X25519 ECDH, HKDF, AES-GCM, Ed↔X25519) — bean
  accord-vknh provides `DeliveryCrypto`.
- `Keyring` impl (`EnvKeyring`) — bean accord-11im.
- Chain reader impl (`@accord/sdk` reads) — bean accord-mwfq.
- `S3Store` impl behind `DeliverStore.get` — bean accord-xrdc.
- HTTP/route wiring (Hono) — server epic accord-s3ow.
