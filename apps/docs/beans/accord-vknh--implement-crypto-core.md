---
# accord-vknh
title: Implement crypto core
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T17:05:00Z
parent: accord-djso
blocked_by:
  - accord-qzca
---

---

assigned: implementer
---

src/keys/ed25519.ts (Ed25519↔X25519, X25519 ECDH) + src/crypto/{ecies,symmetric}.ts: ingest encryption, delivery re-encryption (AES-256-GCM, HKDF-SHA256), integrity gate sha256==evidence_hash. Plaintext in-memory only.

See milestone accord-yjno HANDOFF §4 §3 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Implemented the security-critical crypto core of the Crypto & Foundation epic
(siblings: accord-11im owns config/keyring — done; accord-c07y owns the
canonical tests/crypto.test.ts). No new deps: reuses @noble/curves (added by
accord-11im) for the Ed25519/X25519 math and the platform Web Crypto (Bun) for
SHA-256 / HKDF-SHA256 / AES-256-GCM.

- `src/keys/ed25519.ts` — `ed25519ToX25519PublicKey`, `ed25519SecretToX25519`,
  `x25519SharedSecret`, `newX25519KeyPair`. Wraps the libsodium-equivalent
  birational map (noble top-level exports `edwardsToMontgomeryPub`/`Priv`) so
  the rest of the daemon imports no @noble symbol directly.
- `src/crypto/symmetric.ts` — `sha256`, `hkdfSha256` (empty salt, `length=32`),
  `aesGcmEncrypt`/`aesGcmDecrypt` (wire format `nonce(12)||ct||tag(16)`, random
  nonce, 128-bit tag; decrypt throws on auth failure), `constantTimeEqual` for
  secret/hash compare. All async via Web Crypto; no BufferSource casts (daemon
  tsconfig drops DOM lib; Uint8Array is assignable directly).
- `src/crypto/ecies.ts` — `IngestBundle`/`JurorBundle` types + `INGEST_INFO`/
  `DELIVER_INFO` HKDF labels; `claimantEncrypt` (dek + ephemeral X25519 + ECDH +
  HKDF + double AES-GCM envelope, plaintext_hash=sha256), `operatorDecrypt`
  (in-memory plaintext), `deliverToJuror` (fresh ephemeral, juror-bound ECDH),
  `jurorDecrypt`, and the mandatory `verifyIntegrity` gate
  (`sha256(plaintext)==evidence_hash`, constant-time, throws on mismatch).
- `tests/crypto.impl.test.ts` — 13 RED->GREEN tests: sha256 RFC-6234 vector,
  HKDF determinism + info-separation, AES-GCM round-trip + tamper/wrong-key
  throw, constant-time compare, Ed->X25519 determinism + ECDH symmetry, ingest
  round-trip + wrong-operator-fails + hash correctness, deliver round-trip +
  only-juror-decrypts (DoD property), integrity gate accept/reject, and a full
  claimant->operator->juror end-to-end flow.

Verification: `tsc --noEmit` clean; `eslint` clean; `bun test` 32/32 green
(19 config/keyring + 13 crypto). Plaintext never leaves memory between decrypt
and re-encrypt; only ciphertext blobs are returned.
