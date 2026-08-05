---
# accord-c07y
title: Unit-test crypto core + EnvKeyring
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T17:10:00Z
parent: accord-djso
blocked_by:
  - accord-11im
  - accord-vknh
---

---

assigned: tester
---

tests/crypto.test.ts: Ed↔X25519 round-trips, ECIES enc→dec, AES-GCM/HKDF, gate accept/reject, EnvKeyring map correctness, property: only juror Ed25519 secret decrypts a delivered bundle.

See milestone accord-yjno HANDOFF §5 §6 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Added the canonical crypto-foundation suite `tests/crypto.test.ts` and
consolidated the implementer's scratch suite away (deleted
`tests/crypto.impl.test.ts` — its assertions were folded into the canonical file;
no coverage lost). Covers DoD §5 items 1-2 and the §6 Test Matrix crypto rows.

- **Ed25519↔X25519** — pubkey/secret conversion determinism + 32-byte width,
  distinctness across keys, ECDH symmetry (both parties agree), and an
  end-to-end round-trip cross-check.
- **AES-256-GCM / HKDF-SHA256 / sha256** — RFC-6234 sha256 vector, AES-GCM
  round-trip, `nonce(12)||ct||tag(16)` wire format, tamper/wrong-key rejection,
  HKDF determinism + info-label separation, constant-time equal.
- **ECIES ingest + deliver** — claimant→operator and operator→juror round-trips,
  bundle field well-formedness, `plaintext_hash == sha256(plaintext)`, and
  wrong-operator decrypt failure.
- **DoD property: only the juror secret decrypts** — the real juror key succeeds
  while 8 stranger keys each fail; plus a replay-safety check (fresh ephemeral
  key per delivery → different `out`, same plaintext).
- **Integrity gate** — accept on correct hash, reject on tampered plaintext and
  on a random hash.
- **EnvKeyring map correctness + runtime resolution** — each base58 secret maps
  to the pubkey derived from it; a pubkey standing in for the on-chain
  `evidence_operator` resolves to the right secret and rejects any other; and an
  EnvKeyring-driven ECIES round-trip (claimant→keyring-resolved operator).
- **Full daemon flow** — claimant → operator (via keyring) → integrity gate →
  juror → integrity gate → original plaintext.

Verification: `tsc --noEmit` clean; `eslint` clean; `bun test` 43/43 green
(28 canonical crypto + 15 config/keyring in `tests/keyring.test.ts`).
