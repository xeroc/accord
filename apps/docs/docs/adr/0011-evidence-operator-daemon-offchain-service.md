# Evidence Operator Daemon — off-chain decrypt-re-encryption service; S3/MinIO store, pull delivery, HA replicas, evidence-only (no governance)

The Evidence Operator defined by ADR-0006 is realized as a standalone
**off-chain TypeScript/Bun service** (`apps/evidence-daemon`). It holds a
per-Subaccord Ed25519 keypair whose pubkey is the on-chain
`Subaccord.evidence_operator` (`state.rs:33`); it ingests claimant ciphertexts
into S3/MinIO (ciphertext only — plaintext is never persisted) and, on demand, decrypts and re-encrypts the
cleartext to each **drawn** Juror's pubkey (read authoritatively from on-chain
`Round.jurors[]`). Delivery is **pull and unauthenticated** — confidentiality
holds because re-encryption targets the Juror's pubkey, so only the Juror's key
can surface the cleartext; per-Juror watermarking (when added, v1.1) rides
*inside* the Juror-encrypted payload, so leak attribution is preserved even
without request auth. The daemon is deployed as **stateless HA replicas**
sharing one per-Subaccord keyring and one Storage backend. **The daemon
exercises no governance** — the Subaccord `authority` remains a Squads multisig
operated by humans via the Squads UI (ADR-0005/0007). No program change is
required: `evidence_operator` and `authority` already exist as distinct, mutable
Subaccord fields.

## Considered Options

These were resolved in a grilling session (2026-08-05) against ADR-0006's
accepted trusted-operator model.

- **Crypto model — threshold PRE / TEE (rejected).** With an *offline claimant*
  (evidence is encrypted before jurors are drawn), single-operator "proxy
  re-encryption" gains zero trust reduction over decrypt-re-encrypt: the
  operator can re-encrypt to its own key and read. Only threshold-PRE (m-of-n)
  or a TEE-bound operator actually remove the plaintext-exposure assumption.
  Both are heavier than v1 warrants and were rejected. ADR-0006's
  decrypt-re-encrypt is retained: the operator is trusted, mitigated by open
  source + attributability + (future) watermarking.

- **Daemon-as-authority (rejected).** Conflating the evidence key (necessarily
  *hot* — high-throughput decrypt/re-encrypt) and the governance key (cold-ish —
  param mutation behind a 48h timelock) collapses two blast radii into one
  process. Rejected: the daemon is evidence-only; `authority` stays a Squads
  multisig. The daemon operator *entity* may control the multisig, but the
  daemon *process* signs no governance.

- **Push delivery / sig-auth (rejected).** Push needs an off-chain Juror contact
  directory the daemon must maintain; unnecessary given Jurors are fee-motivated
  and will pull. Signature auth is **not** a confidentiality requirement
  (re-encryption targets the Juror pubkey) nor a watermark-attribution
  requirement (the watermark is inside the J-encrypted blob). Pull + no auth is
  correct and simpler; the only residual is DoS/bandwidth — mitigated by IP
  rate-limiting and optional accounting-only API keys.

- **Storage backend — S3/MinIO (chosen), IPFS/Arweave (deferred).** v1 stores
  encrypted bundles (ciphertext only — plaintext is never persisted) in S3/MinIO
  behind a `Storage` trait; object key `{subaccord}/{dispute}`, idempotent on
  `plaintext_hash`, SSE as defense-in-depth. There is no on-chain
  ciphertext-location field and `evidence_hash` is the *plaintext* commitment, so
  the daemon owns the index. IPFS/Arweave is a trait-swap later without touching
  delivery.

- **Single instance + SLA (rejected) / Shamir key-escrow (deferred).** Single
  instance accepts both transient and permanent downtime risk. v1 ships HA
  stateless replicas (delivery is a pure function of ciphertext + Juror pubkey,
  so horizontal scaling is trivial). Permanent operator failure remains a gap:
  the multisig rotates `evidence_operator`, but pending disputes whose
  ciphertexts were encrypted to the old key are unrecoverable (claimants re-file
  or take the fee-refund path). m-of-n Shamir escrow is a v1.1 hardening
  candidate.

- **One shared evidence key for all subaccords (rejected).** A process
  compromise leaks all in-memory raw keys regardless, so per-Subaccord keys are
  not a confidentiality win — but they *are* an operational-rotation win:
  transfer/rotate one Subaccord's operator without re-keying every Subaccord the
  daemon runs. v1 uses a per-Subaccord keyring (`subaccord → keypair`).

## Consequences

- **No on-chain change.** `evidence_operator: Pubkey` (`state.rs:33`) and
  `UpdatePayload::EvidenceOperator` (`state.rs:265`) already provide the full
  on-chain surface the daemon needs. The daemon is a pure off-chain reader of
  `Subaccord` / `Dispute` / `Round`; it writes nothing.
- **v1 key custody + encrypted-at-rest.** The per-Subaccord keyring is loaded
  from `EVIDENCE_KEYRING` (comma-separated raw Ed25519 secrets, KISS stopgap;
  `Keyring` trait enables a file/KMS migration). Subaccord→key binding is
  resolved at runtime via on-chain `evidence_operator` — no enumeration.
  S3/MinIO holds ciphertext only; plaintext exists ephemerally in memory during
  delivery.
- **Trusted operator (ADR-0006 unchanged).** The daemon sees plaintext and could
  leak. Mitigations: open-source code, attributability, per-Juror watermarking
  in v1.1. Integrity is guaranteed on-chain by `evidence_hash`.
- **Availability SPOF mitigated by HA, not eliminated.** Transient downtime is
  absorbed by replicas; a permanent operator failure loses pending old-key
  ciphertexts (accepted; rotate + re-file). Key escrow deferred.
- **Clean upgrade seams.** `Storage` (IPFS/Arweave later), `Watermark`
  (per-Juror attribution later), and the crypto backend stay pluggable. A
  trustless delivery mechanism (threshold PRE / TEE) remains a future ADR target
  per ADR-0006 — the daemon's external contract is crypto-agnostic enough to
  absorb it without rearchitecting delivery/auth/storage.
- **Governance stays separated.** A compromised evidence key cannot mutate
  Subaccord params; a compromised daemon process cannot move governance (it
  holds no multisig seat). Two blast radii remain distinct.

## References

- ADR-0005 (Subaccord authority — pubkey + timelock), ADR-0006 (evidence —
  on-chain hash, trusted re-encryption operator), ADR-0007 (upgrade — Squads
  multisig then freeze)
- `programs/accord/SPEC.md` (Evidence flow), `programs/accord/src/state.rs:33`
  (`evidence_operator`), `:265` (`UpdatePayload::EvidenceOperator`)
- `CONTEXT.md` — Evidence Operator (domain term)
- `apps/evidence-daemon/SPEC.md` — the daemon build spec (this ADR's
  implementation reference)
