---
# accord-11im
title: Implement config + EnvKeyring
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T16:58:00Z
parent: accord-djso
blocked_by:
  - accord-qzca
---

---

assigned: implementer
---

src/config.ts (env parsing) + src/keys/keyring.ts: EnvKeyring reads EVIDENCE_KEYRING comma-separated base58 secrets, derives pubkeys → Map<pubkey,sk>; forOperator(pubkey) resolves at runtime. Keyring trait abstracts future sources.

See milestone accord-yjno HANDOFF §2 §3 for the shared contract (data types, crypto, edge cases, DoD).

Summary of Changes
------------------

Implemented the config + keyring layer of the Crypto & Foundation epic
(sibling: accord-vknh owns ed25519.ts + crypto/*; accord-c07y owns the
canonical tests/crypto.test.ts). Changes scoped to these two modules + a
focused test file + two direct deps.

- `src/keys/keyring.ts` — `Keyring` trait (async `forOperator(pub) -> Ed25519Keypair | null`;
  null ⇒ daemon does not operate the Subaccord ⇒ 404) + `EnvKeyring` v1 impl.
  Parses `EVIDENCE_KEYRING` (comma-separated base58 Ed25519 raw secrets),
  decodes via `bs58`, derives each pubkey via `@noble/curves/ed25519`, indexes
  `Map<hex(pub), seed>`. Runtime resolution is on-chain: the caller passes the
  Subaccord's `evidence_operator` bytes; no Subaccord enumeration in env
  (SPEC §Keyring). Wrong-length input ⇒ null; invalid base58 / non-32-byte
  seed ⇒ throw at load. `ponytail:` notes the non-constant-time Map lookup
  (operator set is public on-chain → acceptable v1).
- `src/config.ts` — twelve-factor `loadConfig(env)` returning a typed `Config`.
  Validates required vars (RPC, PROGRAM_ID, KEYRING, S3 endpoint/bucket/region),
  coerces ints (PORT default 443, rate/max/retention), `FORCE_PATH_STYLE` bool,
  surfaces optional S3 IAM creds and TLS pair. Fails loud on missing required,
  non-integer numerics, and asymmetric S3-creds / TLS-halves. Secrets are only
  surfaced, never logged.
- `tests/keyring.test.ts` — 19 tests (RED→GREEN): EnvKeyring single/multi/
  whitespace/empty-entry parsing, unknown-pubkey null, non-32-byte null,
  determinism, fixed all-zero-seed anchor (`4zvwRjXU…`), invalid-base58 throw,
  wrong-length throw, empty keyring; config full-parse, per-required-var
  missing throws, empty-keyring rejection, PORT/FORCE_PATH_STYLE/limits/TLS.
- `package.json` — added direct deps `@noble/curves` ^1.9.7 (Ed25519 pubkey
  derivation; reused by accord-vknh crypto core) and `bs58` ^4.0.1 (base58
  decode) + `@types/bs58` devDep. All already transitive in the lockfile.

Verification: `pnpm install` clean; `pnpm --filter @accord/evidence-daemon run
lint` clean; `tsc --noEmit` clean; `bun test` → 19/19 green.

Bug caught by TDD: an early version double-hexed the keyring Map key (constructor
re-applied `toHex` to an already-hexed string) → lookups always missed; fixed by
passing `[pubBytes, seedBytes]` pairs and hexing exactly once.
