---
# accord-g7ac
title: Review storage
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T16:05:00Z
parent: accord-xrdc
blocked_by:
  - accord-3u1e
---

---

assigned: reviewer
---

Verify encrypted-at-rest invariant holds, idempotency correctness, no plaintext path exists in the store layer.

See milestone accord-yjno HANDOFF §3 §5 for the shared contract (data types, crypto, edge cases, DoD).

Review Findings
---------------

**Verdict: APPROVE.** All three invariants hold. Reviewed `src/store/store.ts`,
`src/store/s3.ts`, and `src/store/s3.test.ts` (12 tests, green).

Encrypted-at-rest invariant — HOLDS
-----------------------------------

- `EvidenceBundle` (store.ts) has NO plaintext field by type construction:
  fields are `ct` (ciphertext), `wrapped` (DEK envelope ciphertext),
  `claimantEphemPub` (pubkey), `plaintextHash` (sha256 metadata — also on-chain,
  not a secret), `subaccord`, `dispute`, `ingestedAt`. A caller cannot pass
  plaintext through the store API even if they tried.
- `serializeBundle` emits only `BundleJson` keys (`v, subaccord, dispute, ct,
claimant_ephem_pub, wrapped, plaintext_hash, ingested_at`) — all ciphertext or
  metadata. Verified by the `never-plaintext invariant` test: stored body is
  byte-identical to `serializeBundle(bundle)`, contains no plaintext sentinel,
  has exactly the ciphertext JSON schema, and `ct` round-trips to the exact
  ciphertext bytes.
- Grep confirms: the ONLY `plaintext` references in the store layer are the
  test's negative assertions. No plaintext read/write/serialize path exists.

Idempotency correctness — HOLDS
-------------------------------

`S3Store.put` control flow traced:

- HEAD succeeds + `plaintext-hash` metadata present + equal hash → early return
  (no-op, object untouched). Test proves body unchanged + original `ingestedAt`
  preserved on re-PUT.
- HEAD succeeds + different hash → `EvidenceConflictError` (HTTP 409) with
  coordinates + existing hash.
- HEAD succeeds + object present WITHOUT our metadata (foreign/tampered key) →
  `EvidenceConflictError` (defensive branch, tested).
- HEAD throws `NotFound` → fall through to PUT.
- HEAD throws `EvidenceConflictError` or anything else → re-thrown (never masked).
- Documented & accepted race: HEAD→PUT is non-atomic; a conflicting concurrent
  PUT (different hash, same dispute) cannot occur in-protocol (one dispute ⇒ one
  plaintext). Same-hash concurrent PUTs write identical content (harmless).

No plaintext path in the store layer — HOLDS
--------------------------------------------

`get` returns deserialized `EvidenceBundle` (ciphertext) only — no decrypt step,
no plaintext materialisation anywhere in store.ts/s3.ts. Integrity gating
(`sha256(plaintext) == evidence_hash`) correctly lives in the pipeline layer
(per HANDOFF §1 §4), NOT the store. The store is plaintext-free by construction.

Nits (non-blocking)
-------------------

- **Vestigial `exists` var** in `S3Store.put` (s3.ts:84,114): assigned `false`
  in two places, never read as a branch condition. Dead code (`void exists;`
  kept "for readability"). Harmless; cosmetic cleanup opportunity.
- **Mock vs real MinIO:** tests use a faithful in-memory S3 mock (sanctioned by
  the bean). The defensive `NotFound`-on-GET branch (s3.ts:153, added for MinIO
  variants) is not exercised against a live MinIO backend. Acceptable at this
  layer; real-backend coverage belongs to the pipeline/server e2e bean. The mock
  DOES faithfully throw the real `@aws-sdk/client-s3` `NotFound`/`NoSuchKey`
  classes, so the `instanceof` branches are genuinely exercised.

No code changes required. Review is read-only; this commit records the findings
and flips the bean to completed.
