# Evidence Operator Daemon — v1 Build Specification

> **Status:** specified (not yet built). Authority: ADR-0011 (decision),
> ADR-0006 (evidence model), `CONTEXT.md` (Evidence Operator). This file is the
> implementation reference: crypto, modules, API, deployment, failure modes.
> Code is authority on current state; this spec is authority on intent.

## Overview

`apps/evidence-daemon` is a standalone **off-chain TypeScript/Bun application**
that realizes the Evidence Operator role (ADR-0006). It is the trusted component
that receives a claimant's encrypted evidence, decrypts it, and re-encrypts it
for each **drawn** Juror on demand. The Accord program stores only
`evidence_hash` on-chain; the daemon holds the only copy of the decryption key
and the ciphertext.

The daemon is **evidence-only**. It signs no governance. The Subaccord
`authority` is a Squads multisig operated via the Squads UI (ADR-0005/0007/0011).

### Encrypted-at-rest invariant (non-negotiable)

**Plaintext is never persisted.** The only thing ever written to storage is the
encrypted `EvidenceBundle` (ciphertext). Decrypt → re-encrypt happens
**in-memory per request** and the plaintext is discarded immediately after.
Storage (S3/MinIO) holds ciphertext objects only.

### In scope (v1)

- Per-Subaccord Ed25519 keyring loaded from env (`EVIDENCE_KEYRING`,
  comma-separated raw secrets).
- Ciphertext ingest into **S3/MinIO** (encrypted-at-rest by construction).
- Decrypt → integrity-gate against on-chain `evidence_hash` → re-encrypt to a
  drawn Juror's pubkey → deliver (pull, no auth).
- Stateless HA replicas; shared keyring (env) + shared S3/MinIO backend.
- Pluggable `Storage`, `Keyring`, and `Watermark` seams (v1: S3/MinIO +
  env-keyring + no-op watermark).

### Out of scope (v1)

- Per-Juror watermarking (v1.1 — bean `accord-1acp`; rides inside the
  Juror-encrypted payload, no program change).
- `Keyring` sources beyond env (encrypted file / KMS — trait-pluggable later).
- `Storage` backends beyond S3/MinIO (IPFS/Arweave — trait-pluggable later).
- Shamir m-of-n key escrow for permanent operator failure (v1.1).
- Push delivery; signature-authenticated delivery.
- Threshold PRE / TEE trustless delivery (future ADR; ADR-0006 upgrade target).
- Governance signing of any kind.

## On-chain interface (read-only)

The daemon writes **nothing** on-chain. It reads via `@accord/sdk`:

| Account / event      | Field(s) used                                          | Purpose                                                          |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `Subaccord`          | `evidence_operator`, `evidence_spec`                   | Resolve the per-Subaccord key; pin evidence/watermark scheme.    |
| `Dispute`            | `subaccord`, `evidence_hash`, `state`                  | Locate key; integrity-gate cleartext; gate delivery on state.    |
| `Round`              | `jurors[]`, `round_idx`                                | Authoritative source of the drawn set; re-encrypt target pubkeys.|
| `DisputeCreated`     | `dispute`, `subaccord`, `evidence_hash`                | Indexing wake-up (ciphertext already ingested at file time).     |
| `JurorsDrawn`        | `dispute`, `round`, `jurors`                           | Mark dispute as deliverable (cache hint; `Round` is authoritative). |
| `RulingFinalized`    | `dispute`                                              | Retention sweep trigger.                                         |

The drawn-set check is a **live `Round` account read**, not the event — events
are cache/wake-up hints only.

## Crypto model

One key per Subaccord, dual-used (standard Ed25519↔X25519 scalar conversion, a
la libsodium `crypto_sign_ed25519_sk_to_curve25519`). The on-chain
`evidence_operator` is an Ed25519 pubkey; its Montgomery form is the X25519
encryption pubkey. Claimants need only the on-chain field.

### Ingest encryption (claimant → operator)

```
dek        = randomBytes(32)                          // 256-bit symmetric key
ct         = AES-256-GCM.encrypt(dek, plaintext)      // ciphertext + tag + nonce
ephem_sk   = random X25519 secret
op_x25519  = Ed25519ToX25519(evidence_operator_pubkey)
shared     = X25519(ephem_sk, op_x25519)
k          = HKDF-SHA256(shared, info="accord-ingest-v1")
wrapped    = AES-256-GCM.encrypt(k, dek)              // DEK envelope
bundle     = { ct, claimant_ephem_pub: X25519_pub(ephem_sk), wrapped,
               plaintext_hash: sha256(plaintext) }    // == on-chain evidence_hash
```

Claimant posts `bundle` to `POST /evidence/{subaccord}/{dispute}`. `plaintext_hash`
**must** equal the dispute's on-chain `evidence_hash`; the daemon enforces this
at ingest (and again at delivery as a tamper gate).

### Delivery re-encryption (operator → drawn juror)

```
// 1. decrypt claimant ciphertext
op_sk_x25519 = Ed25519ToX25519Secret(operator_ed25519_sk)
shared_in    = X25519(op_sk_x25519, bundle.claimant_ephem_pub)
k_in         = HKDF-SHA256(shared_in, info="accord-ingest-v1")
dek          = AES-256-GCM.decrypt(k_in, bundle.wrapped)
plaintext    = AES-256-GCM.decrypt(dek, bundle.ct)     // in-memory only

// 2. integrity gate (mandatory)
require!(sha256(plaintext) == dispute.evidence_hash)   // else: refuse + alert

// 3. watermark seam (no-op pass-through in v1)
watermarked  = Watermark.apply(plaintext, juror_pubkey)

// 4. re-encrypt to the juror's X25519 key
juror_x25519 = Ed25519ToX25519(juror_pubkey)           // from Round.jurors[]
ephem2_sk    = random X25519 secret
shared_out   = X25519(ephem2_sk, juror_x25519)
k_out        = HKDF-SHA256(shared_out, info="accord-deliver-v1")
out          = AES-256-GCM.encrypt(k_out, watermarked)

// 5. discard plaintext; return
{ out, operator_ephem_pub: X25519_pub(ephem2_sk) }
```

Juror decrypts symmetrically: convert own Ed25519 secret → X25519,
`X25519(juror_sk, operator_ephem_pub)`, HKDF, AES-GCM decrypt → cleartext; then
verifies `sha256(cleartext) == dispute.evidence_hash` (ADR-0006).

**Why pull + no auth is safe:** step 4 targets the Juror pubkey, so the returned
`out` is decryptable only by the Juror key. A non-Juror fetching gets ciphertext
it cannot read. Per-Juror watermarking (step 3, v1.1) embeds the fingerprint in
`watermarked` *before* the Juror-bound encryption, so only the Juror key can
ever surface the fingerprint — attribution holds without request auth.

## Data model

### Evidence bundle (stored — ciphertext only)

```ts
interface EvidenceBundle {
  subaccord:          PublicKey;   // key selector (also S3 key prefix)
  dispute:            PublicKey;   // primary index (S3 key suffix)
  ct:                 Uint8Array;  // AES-GCM(plaintext) under DEK  — ciphertext
  claimant_ephem_pub: Uint8Array;  // X25519, 32 bytes
  wrapped:            Uint8Array;  // AES-GCM(DEK) under claimant↔operator ECDH — ciphertext
  plaintext_hash:     [u8,32];     // == Dispute.evidence_hash (metadata, not secret)
  ingested_at:        number;      // unix ms
}
```

No plaintext field exists. Idempotency key: `plaintext_hash`.

### Storage trait (pluggable) — v1: S3/MinIO

```ts
interface EvidenceStore {
  put(b: EvidenceBundle): Promise<void>;            // idempotent on plaintext_hash
  get(subaccord: PublicKey, dispute: PublicKey): Promise<EvidenceBundle | null>;
  delete(subaccord: PublicKey, dispute: PublicKey): Promise<void>;
  exists(subaccord: PublicKey, dispute: PublicKey): Promise<boolean>;
}
```

**v1 impl — S3/MinIO (`S3Store`):**

- Object key: `{subaccord}/{dispute}` (URL-safe base58). One object per dispute.
- Object body: the serialized `EvidenceBundle` (CBOR/JSON) — **ciphertext only**.
- Object user-metadata: `x-amz-meta-plaintext-hash`, `x-amz-meta-subaccord`,
  `x-amz-meta-ingested-at`.
- **Idempotent put:** `HEAD` the key first. Missing → `PutObject`. Present →
  compare `plaintext-hash` metadata: equal ⇒ no-op (`201` idempotent); differ ⇒
  `409` (refuse re-upload of a different hash for the same dispute).
- Server-side encryption (SSE-S3 or SSE-KMS) is **belt-and-suspenders** — the
  object body is already application-level ciphertext; SSE protects against
  physical media access, not against the operator (who holds `k_evidence`).
- No database/index for v1 — S3 object metadata is the index. (A Postgres index
  is a trait alternative if query patterns later demand it.)

### Keyring (pluggable) — v1: env var

```ts
interface Keyring {
  // Returns the Ed25519 secret whose pubkey == subaccord.evidence_operator,
  // or null if the daemon does not operate this Subaccord.
  forOperator(operatorPubkey: PublicKey): Promise<Ed25519Keypair | null>;
}
```

**v1 impl — `EnvKeyring`:**

- Reads `EVIDENCE_KEYRING` (comma-separated base58 Ed25519 **raw secrets**, KISS).
- Derives each secret's Ed25519 pubkey → builds `Map<Pubkey, Secret>`.
- **Subaccord→key resolution is runtime, on-chain:** a request names a Subaccord;
  the daemon reads `Subaccord.evidence_operator`, then looks up that pubkey in
  the map. No Subaccord enumeration, no key↔subaccord binding in env — the
  on-chain field is the binding. Unknown operator ⇒ the daemon doesn't operate
  it ⇒ `404`.

> Security note: raw secrets in env is an explicit v1 stopgap (KISS). Env vars
> can leak via `/proc/<pid>/environ`, crash dumps, and process listings. The
> `Keyring` trait exists so a file/KMS source replaces this without touching
> callers. Mitigate v1: dedicated service user, no shared env, secrets injected
> by the orchestrator (not committed), process not core-dumping.

## Module layout

```
apps/evidence-daemon/
  SPEC.md                      // this file
  package.json                 // @accord/evidence-daemon (private; bun)
  tsconfig.json                // extends ../../tsconfig.base.json
  Dockerfile
  src/
    config.ts                  // env parsing (RPC, program id, keyring, S3, port, limits)
    keys/
      ed25519.ts               // Ed25519↔X25519 conversion, X25519 ECDH helpers
      keyring.ts               // Keyring trait + EnvKeyring impl
    crypto/
      ecies.ts                 // ingest encryption + delivery re-encryption
      symmetric.ts             // AES-256-GCM, HKDF-SHA256, sha256
    store/
      store.ts                 // EvidenceStore trait
      s3.ts                    // v1 S3/MinIO impl
    chain/
      reader.ts                // @accord/sdk reads (Subaccord/Dispute/Round)
      events.ts                // log subscriber (DisputeCreated/JurorsDrawn/RulingFinalized)
    pipeline/
      ingest.ts                // POST handler: validate + integrity-gate + store.put
      deliver.ts               // GET handler: store.get + chain read + decrypt + gate + re-encrypt
      watermark.ts             // Watermark trait (no-op v1)
    server/
      app.ts                   // Bun + Hono; routes, rate limit, TLS
      routes.ts                // /evidence, /healthz
    main.ts                    // wiring; stateless, HA-ready
  tests/
    crypto.test.ts             // round-trips, Ed↔X25519, integrity gate
    pipeline.test.ts           // ingest/deliver with stub chain reader
    e2e.test.ts                // full flow vs Surfpool (create_dispute → draw → fetch)
```

## HTTP API (pull, no auth)

All routes TLS-only. Rate-limited per peer IP. An optional `X-Account-Key`
header is accepted for **accounting only** — it never grants or denies access
(security rests on the Juror-bound re-encryption, not on auth).

| Method | Path                                            | Body / Result                                                                          |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/evidence/{subaccord}/{dispute}`              | `EvidenceBundle` → `201` + `Location`. `409` if a different `plaintext_hash` exists.  |
| GET    | `/evidence/{dispute}/for/{juror}`              | → `200` `{ out, operator_ephem_pub }`. `404` if juror not drawn / not deliverable. `409` if integrity gate fails (alerts). |
| GET    | `/healthz`                                      | `200` if Storage + RPC reachable, else `503`.                                          |

Delivery preconditions (enforced via live account reads): `Dispute.state` is at
or past Drawn for the current round; `{juror}` ∈ `Round.jurors[]` for that
round; a bundle exists for `(dispute.subaccord, dispute)`.

## Configuration

Twelve-factor; no secrets in code. Secret vars injected by the orchestrator.

```
EVIDENCE_RPC_URL=              // Solana RPC (read-only ok)
EVIDENCE_PROGRAM_ID=           // Accord program id
EVIDENCE_KEYRING=              // comma-separated base58 Ed25519 raw secrets (v1)
EVIDENCE_S3_ENDPOINT=          // S3 or MinIO (https://…)
EVIDENCE_S3_BUCKET=
EVIDENCE_S3_REGION=
EVIDENCE_S3_ACCESS_KEY_ID=, EVIDENCE_S3_SECRET_ACCESS_KEY=   // or IAM/IRSA in prod
EVIDENCE_S3_FORCE_PATH_STYLE=  // true for MinIO
EVIDENCE_PORT=443
EVIDENCE_RATE_LIMIT_PER_MIN=   // per-IP
EVIDENCE_MAX_EVIDENCE_BYTES=
EVIDENCE_RETENTION_DAYS=       // delete N days after RulingFinalized
EVIDENCE_TLS_CERT=, EVIDENCE_TLS_KEY=
```

## Deployment / HA

- **Stateless replicas.** Delivery is a pure function of `(bundle, juror_pubkey,
  operator_key)`; ingest is an object PUT. Run N replicas behind a TCP/TLS load
  balancer. No session affinity.
- **Shared state.** All replicas share the same `EVIDENCE_KEYRING` env (injected
  by the orchestrator) and the same S3/MinIO bucket.
- **Health.** `/healthz` probes S3 reachability (HEAD bucket) + RPC reachability;
  LB drains on `503`.
- **Retention.** A scheduled sweep lists objects and deletes those whose dispute
  is `EVIDENCE_RETENTION_DAYS` past `RulingFinalized`.
- Ship a `Dockerfile` and a `systemd` unit (or k8s manifest) in the package;
  exact orchestration is an ops choice, not mandated by this spec.

## Failure modes & edge cases

- **Bad upload** (ciphertext undecryptable, or `sha256(plaintext) ≠
  evidence_hash`): rejected at ingest (`400`); claimant re-uploads. If a bad
  bundle is ever stored, the delivery integrity gate refuses (`409`) and alerts.
- **Premature fetch** (dispute not yet drawn, or juror not in `Round.jurors[]`):
  `404`. Juror retries after `JurorsDrawn`.
- **Integrity gate failure at delivery** (stored plaintext ≠ on-chain
  `evidence_hash`): `409`, alert, quarantine object.
- **Unknown operator** (Subaccord's `evidence_operator` not in the keyring map):
  `404` — the daemon does not operate this Subaccord.
- **Operator key compromise:** rotate `evidence_operator` on-chain via the
  Squads multisig (`UpdatePayload::EvidenceOperator`, 48h timelock). **Gap:**
  pending disputes whose bundles were encrypted to the old key are unrecoverable
  by the new operator — accepted (ADR-0011); claimants re-file or the dispute
  takes its fee-refund path. New uploads use the new key.
- **Replica / S3 outage:** HA absorbs transient loss; if S3 is down, `/healthz`
  → `503` and the LB drains. Review-window overlap risk is minimized, not
  eliminated.
- **Large evidence:** stream decrypt/re-encrypt; enforce `EVIDENCE_MAX_EVIDENCE_BYTES`.
- **Replay / double-fetch:** each delivery uses a fresh ephemeral key →
  different ciphertext bytes, same plaintext. Idempotent and harmless.
- **Closed dispute:** retention sweep deletes the object after
  `EVIDENCE_RETENTION_DAYS`; delivery `404`s post-deletion.

## Security considerations

- `k_evidence` (per-Subaccord) is the crown jewel. v1 holds it **raw in-process,
  sourced from env** (ADR-0011). Hardening: minimal process privileges, dedicated
  service user, no secret/plaintext logging, no core dumps, env injected by the
  orchestrator (never committed). `Keyring` trait enables a file/KMS migration.
- **Encrypted-at-rest:** S3/MinIO objects are application-level ciphertext;
  plaintext exists only ephemerally in memory during delivery. SSE-S3/SSE-KMS is
  additional defense-in-depth against media access.
- The daemon is **trusted** (sees plaintext in memory) per ADR-0006. Mitigations:
  open-source, attributability, per-Juror watermarking in v1.1.
- **DoS:** public read endpoint. Per-IP rate limit; response-size cap; optional
  accounting-only API key. No auth path exists to brute-force.
- **TLS mandatory** — ciphertext is the confidentiality layer, but TLS prevents
  metadata/traffic analysis and request enumeration.

## Testing strategy

- **Unit (`crypto.test.ts`):** Ed25519↔X25519 conversion round-trips; ECIES
  encrypt→decrypt; AES-GCM/HKDF; integrity-gate accept/reject; `EnvKeyring` map
  correctness; property: only the holder of the Juror Ed25519 secret can
  decrypt a delivered bundle.
- **Pipeline (`pipeline.test.ts`):** ingest (happy, hash-mismatch reject,
  idempotent re-upload) and deliver (happy, juror-not-drawn `404`, not-yet-drawn
  `404`, integrity-gate `409`, unknown-operator `404`) against a stub
  `chain/reader` and an in-memory `EvidenceStore`.
- **e2e (`e2e.test.ts`) vs Surfpool:** `create_dispute` → `post_snapshot` →
  `commit_vrf` → `draw` → Juror `GET` from a running daemon → Juror decrypts →
  verifies `sha256 == evidence_hash`. This is the sign-off proof that the
  daemon↔program contract is real, mirroring the program's e2e green rule.
- TDD only (AGENTS.md): RED → GREEN → REFACTOR per module.

## References

- ADR-0011 (this daemon's decision), ADR-0006 (evidence), ADR-0005 (authority),
  ADR-0007 (upgrade/multisig)
- `programs/accord/SPEC.md` (Evidence flow), `programs/accord/src/state.rs:33,265`
- `CONTEXT.md` — Evidence Operator
- `packages/sdk` — `@accord/sdk` (chain reader + types)
