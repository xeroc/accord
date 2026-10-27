---
# accord-jjdw
title: Review crypto-foundation
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T17:15:00Z
parent: accord-djso
blocked_by:
  - accord-c07y
---

---

assigned: reviewer
---

Review scaffold + config/keyring + crypto for correctness, no plaintext logging/persistence, key-hygiene. Approve or block.

See milestone accord-yjno HANDOFF §3 §5 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

**Verdict: APPROVE.** The Crypto & Foundation epic (accord-qzca scaffold,
accord-11im config+keyring, accord-vknh crypto, accord-c07y tests) is sound.
No blocking issues. Reviewer re-ran the full suite independently (43/43 green;
`tsc --noEmit` clean; `eslint` clean) and audited the three mandated axes.

Audit
.....

- **Correctness** — Ed25519↔X25519 uses @noble/curves' canonical birational map
  (`edwardsToMontgomeryPub`/`Priv`), the libsodium `crypto_sign_ed25519_*_to_curve25519`
  equivalent. X25519 ECDH symmetry is test-proven. AES-256-GCM uses a fresh random
  96-bit nonce per op + 128-bit tag, throws on auth failure; wire format
  `nonce(12)||ct||tag(16)` is consistent across encrypt/decrypt. HKDF-SHA256 uses
  role-pinned `info` labels (`accord-ingest-v1` vs `accord-deliver-v1`) → proper key
  separation. Integrity gate is constant-time, mandatory, and throws on mismatch.
  DoD §5 items 1-2 satisfied.
- **No plaintext logging/persistence (encrypted-at-rest invariant)** — `grep` of
  `src/` finds ZERO sinks: no `console.*`, no `process.stdout/stderr`, no
  `writeFile`/`appendFile`, no `fetch`. Every ecies fn is a pure transform; the only
  plaintext is the transient `operatorDecrypt` return value handed to the (future)
  pipeline, which must gate → re-encrypt → drop. The crypto layer itself persists
  nothing; it only produces/returns ciphertext blobs.
- **Key hygiene** — Ed25519 seeds live in a `private readonly ReadonlyMap`;
  `forOperator` returns `.slice()` copies (no internal-state aliasing). No @noble
  symbol leaks past `keys/ed25519.ts` (clean layering). HKDF keys are derived, never
  stored. The `claimantEncrypt` path is documented as claimant-side / test-vector
  only (the daemon decrypts, never re-encrypts-at-ingest).

Non-blocking observations (v1-accepted, ADR-0006 trusted-daemon; NO new beans)
.............................................................................

1. DEK / operator-seed are not explicitly zeroed after use (JS GC only). ADR-0006
   trusts the daemon process; secure-wipe is a v1.1 concern alongside the KMS
   keyring migration the `Keyring` trait already enables.
2. `EnvKeyring` Map lookup is not constant-time — already `ponytail:`-commented;
   operator membership is public on-chain, so the timing leak is acceptable.
3. `config.ts` surfaces the raw `EVIDENCE_KEYRING` string for the process lifetime
   (needed to build `EnvKeyring`). Redundant after construction but harmless — the
   same material lives in the keyring regardless.
4. `IngestBundle` carries only the four crypto fields; the stored `EvidenceBundle`
   (`subaccord`/`dispute`/`ingested_at`) is the store layer's job — correct separation.

Conclusion
..........

Gate passes. The crypto-foundation is correct, secrets are never logged or
persisted, and key hygiene fits the v1 trusted-daemon model. Lane may proceed.
