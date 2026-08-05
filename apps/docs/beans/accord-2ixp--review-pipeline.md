---
# accord-2ixp
title: Review pipeline
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-zv7j
blocked_by:
  - accord-rc71
---

---

assigned: reviewer
---

Verify pull-no-auth confidentiality holds, plaintext never persisted/logged, integrity gate mandatory, correct 404/409 mapping.

See milestone accord-yjno HANDOFF §3 §5 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Read-only review of `apps/evidence-daemon/src/pipeline/{watermark,ingest,deliver}.ts`
against the four pipeline invariants. **Result: PASS on all four — no code
changes warranted.** Evidence and forward notes below. (No source touched this
bean; verification is the deliverable. Suite re-run: 22/22 green.)

Invariant 1 — Pull-no-auth confidentiality holds [PASS]
-------------------------------------------------------

The returned `out` is decryptable only by the drawn juror's key, so no request
auth is required (ADR-0006).

- The drawn check gates re-encryption: `deliver.ts:107-111` returns 404 before
  any decrypt/reencrypt unless `juror ∈ Round.jurors[]` (live read; `Round` is
  authoritative per SPEC).
- `reencryptToJuror(watermarked, juror)` (`deliver.ts:129`) targets the juror
  pubkey; the `DeliveryCrypto` port contract binds the impl to juror-bound
  X25519 re-encryption. A non-juror fetching either gets 404 (not drawn) or
  ciphertext it cannot read (not its key).
- No 200 path bypasses the drawn check; no auth path exists to brute-force.

Invariant 2 — Plaintext never persisted/logged [PASS]
-----------------------------------------------------

- `EvidenceBundle` (`ingest.ts:27-35`) has no `plaintext` field — only
  `plaintext_hash` (metadata == on-chain `evidence_hash`, not secret).
- `ingest()` stores the bundle as received: `ingest.ts:141`
  `store.put({ ...bundle, ingested_at: Date.now() })` — ciphertext only; no
  plaintext is ever constructed at ingest.
- `DeliverStore` (`deliver.ts:44-49`) is **get-only** — deliver has no write
  surface, so plaintext decrypted in memory (`deliver.ts:119`) cannot reach
  storage. It is consumed by the gate (121), watermark (128), and reencrypt
  (129), then goes out of scope.
- No `console`/logger/`stdout`/`stderr` calls anywhere in pipeline src (grep
  clean) — nothing logs plaintext or secrets. (HTTP-layer body logging is
  accord-s3ow's responsibility — see Forward Notes.)

Invariant 3 — Integrity gate is mandatory [PASS]
-------------------------------------------------

- `deliver.ts:121-126`: `sha256(plaintext) != evidence_hash → 409`, and it sits
  on the ONLY path to 200 (after unwrap, before watermark/reencrypt). Unbypassable.
- At ingest, the check is metadata-only by design (`ingest.ts:126-128`,
  `plaintext_hash == evidence_hash`); the full decrypt-and-verify gate there is
  deferred to the crypto bean (accord-vknh). Delivery is the mandatory net,
  which is present — matching SPEC ("if a bad bundle is ever stored, the
  delivery integrity gate refuses (409)").

Invariant 4 — Correct 404/409 mapping [PASS]
---------------------------------------------

deliver: dispute/subaccord/bundle missing → 404; unknown operator → 404;
round missing (premature) → 404; juror ∉ Round.jurors → 404; unwrap null
(tampered) → 409; gate fail → 409 (`deliver.ts:94,97,101,105,108,110,117,123`).
ingest: malformed/path-mismatch/hash-mismatch → 400; dispute missing → 404;
different plaintext_hash present → 409; new/same → 201 (`ingest.ts:95,101,104,
107,110,113,116,121,124,127,133,136,142`). All match SPEC §HTTP API / HANDOFF §3.

Forward notes (non-blocking, for downstream beans)
--------------------------------------------------

- `bytesEqual` is duplicated in `ingest.ts:72` and `deliver.ts:80` (5-liner).
  Acceptable at two uses; consolidate into a shared `bytes.ts` only on the
  third use (ponytail). No action now.
- Ingest does NOT decrypt-and-verify (metadata-only by design). A claimant can
  store a bundle whose `plaintext_hash` matches but whose `ct` is garbage; it
  will 409 at delivery. This is the accepted SPEC gap — delivery is the net.
  When accord-vknh lands, an optional ingest verify step can tighten this.
- No explicit in-memory plaintext zeroing in deliver (JS cannot guarantee it).
  Accepted v1 property — the daemon is trusted (ADR-0006); plaintext is
  ephemeral and GC'd. Flag for the v1.1 hardening pass if zeroization becomes
  a requirement.
- Request body size limiting (`EVIDENCE_MAX_EVIDENCE_BYTES`) and per-IP rate
  limit belong to the HTTP boundary (accord-s3ow), not the pipeline.
- `operatorSecret` is typed opaquely as `Uint8Array` to decouple from the
  crypto bean's key format; accord-vknh may refine the `Keyring`/`DeliveryCrypto`
  signatures when it lands — re-run this suite after that wiring.
- HTTP layer (routes.ts) should avoid logging request bodies / delivered `out`
  and may sanitize the detailed `reason` strings in client-facing responses
  (keep the detail in ops logs).
