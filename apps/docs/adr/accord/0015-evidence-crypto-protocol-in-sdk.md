# Evidence crypto protocol lives in @accord/sdk — shared by claimant, operator, and juror (amends ADR-0011)

The evidence encryption protocol — ECIES ingest/deliver envelopes, AES-256-GCM,
HKDF-SHA256, and the Ed25519↔X25519 conversion (ADR-0006's "standard asymmetric
encryption" decrypt-re-encrypt) — is a **multi-party wire contract** pinned by
the on-chain `evidence_hash`. The claimant encrypts, the operator decrypts and
re-encrypts, the juror decrypts; all three must implement it byte-for-byte
identically. It is not daemon plumbing. It lives in **`@accord/sdk/evidence`**
(a sub-path export of `@accord/sdk`), so claimant, operator, and juror import
one implementation and the protocol cannot drift between participants. Every
primitive delegates to the audited `@noble` suite (`@noble/ciphers`,
`@noble/hashes`, `@noble/curves`); nothing is hand-rolled — the only thing owned
is the construction order and the HKDF `info` role labels, exactly as
`packages/sdk/src/methods/mst.ts` owns a node layout over a library hash.

This amends ADR-0011, which located the crypto inside the daemon. The daemon's
other decisions (HA stateless replicas, S3/MinIO ciphertext store, pull + no-auth
delivery, per-Subaccord env keyring, evidence-only / no governance, trusted
operator per ADR-0006) are **unchanged** — only the crypto's home moved. The
daemon keeps `EnvKeyring` (an app concern) and `implements` the SDK's `Keyring`
interface; it dropped its direct `@noble/curves` dependency.

## Considered Options

- **Crypto spine — noble suite (chosen) vs libsodium vs Web Crypto.** The noble
  suite (`@noble/curves` already present + `@noble/ciphers` + `@noble/hashes`)
  is **wire-format-preserving**: the same AES-256-GCM, HKDF-SHA256, and
  `nonce‖ct‖tag` blob mean the bytes on the wire are identical to the daemon's
  prior Web-Crypto implementation — no protocol revision, no migration. It is
  pure-JS, sync, audited, and tree-shakeable behind the sub-path export.
  libsodium's `crypto_box` / `crypto_box_seal` is a black-box encrypt-to-pubkey
  but ships XChaCha20/XSalsa20-Poly1305 — a **different AEAD → different wire
  format → migration**, rejected for a frozen-spec pre-deployment change. Web
  Crypto (`subtle`) is platform-provided but leaves two backends in one module
  and is async-only with manual nonce packing. → noble.

- **Export shape — sub-path `@accord/sdk/evidence` (chosen) vs main export.** A
  sub-path entry in the SDK `exports` map means Arbitrables that only do
  `create_dispute` CPI do not transitively pull the noble crypto stack
  (pay-for-what-you-use). A main export is simpler but couples every SDK
  consumer to the crypto deps. → sub-path.

- **Key model — keep Ed25519↔X25519 dual-use (chosen, ADR-0006) vs separate
  on-chain X25519 registry.** Solana identities are Ed25519; ECIES operates on
  X25519. Dual-use converts one identity key to its Montgomery form for
  encryption (a `@noble/curves` call, not hand-rolled), needing zero extra
  on-chain state — claimants derive the target from the on-chain
  `evidence_operator` / `Round.jurors[]` they already read. A separate X25519
  key registry eliminates the conversion but requires program changes (new
  fields on `Subaccord` + `JurorStake`, a key-registration instruction) — out of
  v1 scope. → dual-use.

## Consequences

- **One implementation across three parties.** Claimant and juror SDK clients
  are now first-class — previously they had no supported encrypt/decrypt path
  and would have had to reimplement the protocol from the daemon's source.
- **Daemon shrinks to app concerns.** `src/crypto/`, `src/keys/ed25519.ts`, the
  `Keyring` / `Ed25519Keypair` definitions, and the direct `@noble/curves`
  dependency were removed. `EnvKeyring`, the S3 store, the pipeline, and HTTP
  remain. The daemon's test suite (123 tests) passes unchanged.
- **Byte-compatible, proven.** The wire format is identical to the prior
  implementation: HKDF was cross-validated against Node's independent
  `crypto.hkdfSync` (RFC 5869 Test Case 1), and the daemon's existing
  integration suite passed without modification. No stored bundle or test
  vector churned.
- **SDK dependency surface.** `@accord/sdk` gains `@noble/{ciphers,hashes,curves}`
  behind the `./evidence` sub-path; non-evidence SDK consumers are unaffected.
- **ADR-0011 seam preserved.** ADR-0011's "crypto backend stays pluggable"
  consequence holds: the noble spine is isolated in `evidence/crypto.ts`, and a
  future trustless delivery mechanism (threshold PRE / TEE — ADR-0006's upgrade
  target) slots behind the same protocol surface, changing only the operator's
  decrypt step.

## References

- ADR-0006 (evidence — on-chain hash, trusted re-encryption operator: the model
  this protocol implements), ADR-0011 (Evidence Operator Daemon — amended by
  this ADR; daemon decisions otherwise unchanged), ADR-0010 (`@accord/sdk`
  facade — the SDK this sub-path extends)
- `apps/evidence-daemon/SPEC.md` §Crypto model; `packages/sdk/src/evidence/`
- bean `accord-c07y` (crypto core + EnvKeyring)
