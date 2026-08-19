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
`evidence_hash` on-chain (round 0; the per-round `evidence_hashes[]` array is
ADR-0023, §"Per-round delivery"); the daemon holds the only copy of the
decryption key and the ciphertext.

The daemon is **evidence-only**. It signs no governance. The Subaccord
`authority` is a Squads multisig operated via the Squads UI (ADR-0005/0007/0011).

### Encrypted-at-rest invariant (non-negotiable)

**Plaintext is never persisted.** The only thing ever written to storage is the
encrypted `EvidenceBundle` (ciphertext). Decrypt → re-encrypt happens
**in-memory per request** and the plaintext is discarded immediately after.
Storage (S3/MinIO or local FS) holds ciphertext objects only.

### In scope (v1)

- Per-Subaccord Ed25519 keyring loaded from env (`EVIDENCE_KEYRING`,
  comma-separated raw secrets).
- Ciphertext ingest into **S3/MinIO or a local filesystem** (encrypted-at-rest
  by construction; backend selected by `EVIDENCE_STORAGE`).
- Decrypt → integrity-gate against on-chain `evidence_hash` → re-encrypt to a
  drawn Juror's pubkey → deliver (pull, no auth).
- Stateless HA replicas; shared keyring (env) + shared storage backend (S3 for
  HA; FS for single-node).
- Pluggable `Storage`, `Keyring`, and `Watermark` seams (v1: S3/MinIO + local FS
  - env-keyring + no-op watermark).

### Out of scope (v1)

- Per-Juror watermarking (v1.1 — bean `accord-1acp`; rides inside the
  Juror-encrypted payload, no program change).
- `Storage` backends beyond S3/MinIO and local FS (IPFS/Arweave — trait-pluggable later).
- Shamir m-of-n key escrow for permanent operator failure (v1.1).
- Push delivery; signature-authenticated delivery.
- Threshold PRE / TEE trustless delivery (future ADR; ADR-0006 upgrade target).
- Governance signing of any kind.

## On-chain interface (read-only)

The daemon writes **nothing** on-chain. It reads via `@useaccord/sdk`:

| Account / event   | Field(s) used                           | Purpose                                                                                                           |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Subaccord`       | `evidence_operator`, `evidence_spec`    | Resolve the per-Subaccord key; pin evidence/watermark scheme.                                                     |
| `Dispute`         | `subaccord`, `evidence_hash`, `state`   | Locate key; integrity-gate cleartext; gate delivery on state. Per-round: `evidence_hashes[0..=round]` (ADR-0023). |
| `Round`           | `jurors[]`, `round_idx`                 | Authoritative source of the drawn set; re-encrypt target pubkeys.                                                 |
| `DisputeCreated`  | `dispute`, `subaccord`, `evidence_hash` | Indexing wake-up (ciphertext already ingested at file time).                                                      |
| `JurorsDrawn`     | `dispute`, `round`, `jurors`            | Mark dispute as deliverable (cache hint; `Round` is authoritative).                                               |
| `RulingFinalized` | `dispute`                               | Retention sweep trigger.                                                                                          |

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
`watermarked` _before_ the Juror-bound encryption, so only the Juror key can
ever surface the fingerprint — attribution holds without request auth.

### Per-round delivery (ADR-0023 — in flight, milestone `accord-qp7c`)

Round 0 carries the filer's evidence; each appeal round may carry a new
rebuttal package. On-chain this is `Dispute.evidence_hashes:
[[u8;32]; MAX_APPEALS + 1]` (ADR-0023); `[0u8;32]` at a slot means "no new
evidence this round." Delivery becomes a loop over the array rather than a
single re-encryption:

```
// per drawn juror in round N
for k in 0..=N {
    let h = dispute.evidence_hashes[k];
    if h == [0u8; 32] { continue; }                  // sentinel: reuse prior rounds
    let bundle = store.get(subaccord, dispute, k);   // one bundle per round (below)
    let plaintext_k = decrypt(bundle);               // in-memory only
    require!(sha256(plaintext_k) == h);              // integrity-gate EACH round
    deliver(reencrypt(plaintext_k, juror_pubkey));   // separate package per round
}
```

- **One bundle per round** (Data model below): `(subaccord, dispute, round)` is
  the storage key; round 0 is today's single bundle.
- **Independent integrity gates:** each round's plaintext is gated against its
  own `evidence_hashes[k]`; a tampered round-k package fails its gate without
  poisoning rounds `0..k-1`.
- **Separate packages, not concatenated:** each round is delivered as its own
  re-encrypted package (matches the per-hash verification model in
  `EVIDENCE-FORMAT.md` §9.4). The juror verifies each independently.
- **Sentinel skip:** a zero slot delivers nothing for that round; the juror
  reuses the accumulated packages from earlier rounds.
- **Round-ascending order:** delivery is ordered claim → rebuttal so the juror
  reads them in sequence.
- **Backward compatibility:** until ADR-0023's on-chain array lands,
  `Dispute.evidence_hash` is a single `[u8;32]` and the loop degenerates to the
  single-hash flow above (round 0 only) — no daemon change required to keep
  round-0 delivery working today.

## Data model

### Evidence bundle (stored — ciphertext only)

```ts
interface EvidenceBundle {
  subaccord: PublicKey; // key selector (also S3 key prefix)
  dispute: PublicKey; // primary index (S3 key component)
  round: u8; // evidence round: 0 = filer; 1..MAX_APPEALS = appeal rounds (ADR-0023)
  ct: Uint8Array; // AES-GCM(plaintext) under DEK  — ciphertext
  claimant_ephem_pub: Uint8Array; // X25519, 32 bytes
  wrapped: Uint8Array; // AES-GCM(DEK) under claimant↔operator ECDH — ciphertext
  plaintext_hash: [u8, 32]; // == Dispute.evidence_hashes[round] (metadata, not secret)
  ingested_at: number; // unix ms
}
```

No plaintext field exists. Idempotency key: `(round, plaintext_hash)`. Round 0
is today's single bundle; rounds `1..MAX_APPEALS` exist only when ADR-0023's
on-chain array is live and an appeal posts a non-sentinel `new_evidence_hash`.

### Storage trait (pluggable) — v1: S3/MinIO or local FS

```ts
interface EvidenceStore {
  put(b: EvidenceBundle): Promise<void>; // idempotent on (round, plaintext_hash)
  get(subaccord: PublicKey, dispute: PublicKey, round: u8): Promise<EvidenceBundle | null>;
  delete(subaccord: PublicKey, dispute: PublicKey, round: u8): Promise<void>;
  exists(subaccord: PublicKey, dispute: PublicKey, round: u8): Promise<boolean>;
}
```

Backend is selected by `EVIDENCE_STORAGE` (`s3` default, or `fs`). Only the
selected backend's env vars are required — an `fs` deployment needs no S3
credentials (and vice versa).

**v1 impl A — S3/MinIO (`S3Store`, default):**

- Object key: `{subaccord}/{dispute}/{round}` (URL-safe base58). One object per
  `(dispute, round)` — round 0 is the filer's package, appeal rounds append
  `{1..MAX_APPEALS}` only when ADR-0023 is live (ADR-0023).
- Object body: the serialized `EvidenceBundle` (JSON + base64) — **ciphertext only**.
- Object user-metadata: `plaintext-hash`, `subaccord`, `ingested-at`.
- **Idempotent put:** `HEAD` the key first. Missing → `PutObject`. Present →
  compare `plaintext-hash` metadata: equal ⇒ no-op (`201` idempotent); differ ⇒
  `409` (refuse re-upload of a different hash for the same dispute).
- Server-side encryption (SSE-S3 or SSE-KMS) is **belt-and-suspenders** — the
  object body is already application-level ciphertext; SSE protects against
  physical media access, not against the operator (who holds `k_evidence`).
- No database/index for v1 — S3 object metadata is the index. (A Postgres index
  is a trait alternative if query patterns later demand it.)

**v1 impl B — local filesystem (`FsStore`, `EVIDENCE_STORAGE=fs`):**

- Object path: `{EVIDENCE_FS_ROOT_DIR}/{subaccord}/{dispute}/{round}.json`. One
  file per `(dispute, round)`, same key shape as S3.
- Object body: byte-identical to the S3 body (`serializeBundle`) — **ciphertext only**.
  No sidecar metadata: `plaintext_hash` lives in the serialized bundle itself.
- **Idempotent put:** read the file first. Missing → `mkdir -p` + write. Present
  → deserialize + compare `plaintext_hash`: equal ⇒ no-op; differ ⇒ `409`. A
  foreign (non-bundle) file at the path ⇒ `409` (colliding path / tamper).
- `/healthz` probes `stat(rootDir).isDirectory()`; the root is created on boot.
- Race semantics match S3Store (read-then-write; last-writer-wins on the
  metastable race — a conflicting PUT does not occur in the protocol).
- **Single-node only.** For HA / multi-replica, use S3 (or a shared volume).

### Domain CAS namespace (storage seam — ADR-0027)

Public, content-addressed storage for domain documents (canon's
`rules_hash` / `Subaccord.domain_ref` preimages). A separate namespace from
evidence: **plaintext by design** — readership is "everyone", so the
encrypted-at-rest invariant above applies to evidence only. The store is a
dumb CAS: no parsing, no format mandate, no chain reads.

```ts
interface DomainStore {
  put(o: DomainObject): Promise<void>; // idempotent on bytes; different bytes at same hash ⇒ conflict
  get(hash: string): Promise<DomainObject | null>;
  exists(hash: string): Promise<boolean>; // no delete — retention is forever
}
```

- **Key:** `domains/{hash}` (`hash` = 64-char lowercase hex sha256 of the
  bytes; validated before it reaches a path/key). Backends share the evidence
  deployment's client+bucket (S3) or `rootDir` (fs) — the `domains/` prefix is
  the only separator, and retention sweeps must never touch it.
- **Idempotent put:** existing object with equal bytes ⇒ no-op (first
  content-type wins); different bytes at the same hash ⇒ `DomainConflictError`
  (a sha256 collision alarm — never overwrite); absent ⇒ write.
- **Content-type:** stored alongside the bytes and round-trips on both
  backends (S3 native `ContentType`; fs JSON envelope `{v, content_type,
  bytes}`). The HTTP layer defaults it to `text/markdown`; the store never
  sniffs it.
- **Format-blind:** bytes in, bytes out — arbitrary binary round-trips
  byte-exact.
- v1 impls: `S3DomainStore` (`domain-s3.ts`), `FsDomainStore` (`domain-fs.ts`);
  trait + errors in `domain.ts`.

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
  package.json                 // @useaccord/evidence-daemon (private; bun)
  tsconfig.json                // extends ../../tsconfig.base.json
  Dockerfile
  src/
    keys/
      keyring.ts               // EnvKeyring impl (Keyring trait + Ed25519Keypair → @useaccord/sdk/evidence)
    store/
      store.ts                 // EvidenceStore trait
      s3.ts                    // S3/MinIO impl (default)
      fs.ts                    // local filesystem impl (EVIDENCE_STORAGE=fs)
      domain.ts                // DomainStore trait — public doc CAS (ADR-0027)
      domain-s3.ts             // S3/MinIO impl — key domains/{hash}
      domain-fs.ts             // local filesystem impl — domains/{hash}.json envelope
    chain/
      reader.ts                // @useaccord/sdk reads (Subaccord/Dispute/Round)
      events.ts                // log subscriber (DisputeCreated/JurorsDrawn/RulingFinalized)
    pipeline/
      ingest.ts                // POST handler: validate + integrity-gate + store.put
      deliver.ts               // GET handler: store.get + chain read + decrypt + gate + re-encrypt
      domain.ts                // PUT/GET /domains/{hash} pipeline: cap → hash check → CAS (ADR-0027)
      watermark.ts             // Watermark trait (no-op v1)
    server/
      app.ts                   // Bun + Hono; routes, rate limit, TLS
      routes.ts                // /evidence, /healthz
      domain.ts                // PUT/GET /domains/{hash} routes (ADR-0027)
    main.ts                    // wiring; stateless, HA-ready
  tests/
    crypto.test.ts             // EnvKeyring ↔ @useaccord/sdk/evidence integration
    pipeline.test.ts           // ingest/deliver with stub chain reader
    e2e.test.ts                // full flow vs Surfpool (create_dispute → draw → fetch)
```

**Crypto protocol home.** The evidence ECIES / AES-256-GCM / HKDF-SHA256 /
Ed↔X25519 protocol (formerly `src/crypto/` + `src/keys/ed25519.ts`) lives in
**`@useaccord/sdk/evidence`** (ADR-0015) — shared byte-exact by claimant, operator,
and juror. The daemon imports it; this app owns only `EnvKeyring`, storage, the
pipeline, and HTTP.

## HTTP API (pull, no auth)

All routes TLS-only. Rate-limited per peer IP. An optional `X-Account-Key`
header is accepted for **accounting only** — it never grants or denies access
(security rests on the Juror-bound re-encryption, not on auth).

| Method | Path                                        | Body / Result                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/evidence/{subaccord}/{dispute}[/{round}]` | `EvidenceBundle` → `201` + `Location`. `409` if a different `plaintext_hash` exists for that `(dispute, round)`. `round` defaults to `0` (filer); appeal rounds `1..MAX_APPEALS` post under ADR-0023.                                                                                                        |
| POST   | `/evidence/synod/{case}/{party}`            | Synod pre-dispute grouping (accord-daq8): party `0..6` pushes an `EvidenceBundle` for a SynodCase **before** a dispute exists; stored grouped by case PDA + slot (key `{subaccord}/{case}/{slot}`). Unauthenticated by design — the join-committed per-party hash is the commit; junk fails post-file root verification. `404` case absent; `400` slot ≥ `party_count`; `409` once `SynodCase.dispute` is bound or a different hash fills the slot.                |
| GET    | `/evidence/{dispute}/for/{juror}`           | → `200` `{ rounds: [{ round, out, operator_ephem_pub }] }` — every non-zero `evidence_hashes[0..=N]` package for the juror's round `N` (ADR-0023). `404` if juror not drawn / not deliverable. `409` if any round's integrity gate fails (alerts). **Synod bridge (accord-g1dy):** when `Dispute.filer` is a SynodCase bound to the dispute, serves the assembled group — one package per party slot (`round` = slot), gated by the recomputed file-time root `H(case ‖ h_0…h_{N-1}) == evidence_hashes[0]`; mismatch ⇒ `409` assembly refused. |
| GET    | `/evidence/synod/{case}`                    | Assembled multi-bundle manifest (accord-lry5): per-slot entries with the ADR-0017 payload + `party` field, absent slots marked (partial pre-file view), daemon-decrypted in memory. Post-file `verified` = recomputed `H(case ‖ h_0…h_{N-1})` vs `evidence_hashes[0]`; mismatch/missing slot ⇒ `verified: false` (deliver bridge refuses assembly on the same input). `404` case/bound-dispute absent.            |
| GET    | `/evidence/{subaccord}/{dispute}[/{round}]` | → `200` decrypted manifest (plaintext). Daemon decrypts in memory using the operator key; no auth. `404` if no bundle / subaccord / unknown operator. `409` if undecryptable. `round` defaults to `0`. **MVP:** returns the full plaintext; will publish only public parts once the manifest schema is defined. |
| PUT    | `/domains/{hash}`                          | Public document CAS (ADR-0027). Body = arbitrary bytes ≤ `EVIDENCE_MAX_DOMAIN_BYTES` (default 1 MiB; over-cap ⇒ `413` before any store write). `sha256(body)` must equal the 64-lowercase-hex route hash, else `400`. `201` + `Location` on create; `200` no-op on byte-identical re-PUT (first Content-Type wins); `409` if different bytes exist at the hash (collision alarm — never overwrite). Content-Type stored verbatim, defaults `text/markdown`. No auth, no chain gate — upload legally precedes `create_list`. Malformed hash ⇒ `400`. |
| GET    | `/domains/{hash}`                          | → `200` the stored bytes + stored Content-Type; `ETag: {hash}`, `Cache-Control: immutable` (retention is forever — no DELETE route, sweeps never touch `domains/`). `404` unknown hash; `400` malformed hash. No auth. |
| GET    | `/healthz`                                  | `200` if Storage + RPC reachable, else `503`.                                                                                                                                                                                                                                                                |
| GET    | `/config`                                   | → `200` `{ operators: [{ base58, hex }] }` — the operator Ed25519 **public** keys loaded into the keyring (== on-chain `evidence_operator` set). Discloses nothing else: no seeds, no RPC/storage/server config. Pubkeys are public by construction. |

Delivery preconditions (enforced via live account reads): `Dispute.state` is at
or past Drawn for the current round; `{juror}` ∈ `Round.jurors[]` for that
round; a bundle exists for each `(dispute.subaccord, dispute, round)` where
`evidence_hashes[round]` is non-zero and `round ≤ juror's round` (ADR-0023).

## Configuration

Twelve-factor; no secrets in code. Secret vars injected by the orchestrator.

```
EVIDENCE_RPC_URL=              // Solana RPC (read-only ok)
EVIDENCE_PROGRAM_ID=           // Accord program id
EVIDENCE_KEYRING=              // comma-separated base58 Ed25519 raw secrets (v1)
EVIDENCE_STORAGE=              // s3 (default) or fs — picks the ciphertext backend
#   S3 backend (required when EVIDENCE_STORAGE=s3):
EVIDENCE_S3_ENDPOINT=          // S3 or MinIO (https://…)
EVIDENCE_S3_BUCKET=
EVIDENCE_S3_REGION=
EVIDENCE_S3_ACCESS_KEY_ID=, EVIDENCE_S3_SECRET_ACCESS_KEY=   // or IAM/IRSA in prod
EVIDENCE_S3_FORCE_PATH_STYLE=  // true for MinIO
#   FS backend (required when EVIDENCE_STORAGE=fs):
EVIDENCE_FS_ROOT_DIR=          // absolute path; created on first put
EVIDENCE_PORT=443
EVIDENCE_RATE_LIMIT_PER_MIN=   // per-IP
EVIDENCE_TRUST_PROXY=          // true → honor X-Forwarded-For (only behind a trusted LB/Ingress); default false
EVIDENCE_MAX_EVIDENCE_BYTES=
EVIDENCE_MAX_DOMAIN_BYTES=     // domain-doc PUT cap (ADR-0027); default 1 MiB; domain objects are never swept
EVIDENCE_RETENTION_DAYS=       // delete N days after RulingFinalized
EVIDENCE_TLS_CERT=, EVIDENCE_TLS_KEY=
```

## Deployment / HA

- **Stateless replicas.** Delivery is a pure function of `(bundle, juror_pubkey,
operator_key)`; ingest is an object PUT. Run N replicas behind a TCP/TLS load
  balancer. No session affinity.
- **Shared state.** All replicas share the same `EVIDENCE_KEYRING` env (injected
  by the orchestrator) and the same storage backend (S3 bucket for HA; the FS
  backend is single-node — share via a volume at your own discretion).
- **Health.** `/healthz` probes the storage backend (S3 HEAD bucket / FS `stat`)
  - RPC reachability; LB drains on `503`.
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
- **Replica / storage outage:** HA absorbs transient loss; if the storage
  backend (S3 or FS volume) is down, `/healthz` → `503` and the LB drains.
  Review-window overlap risk is minimized, not eliminated.
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
- **Encrypted-at-rest:** the storage backend (S3/MinIO or local FS) holds
  application-level ciphertext; plaintext exists only ephemerally in memory
  during delivery. SSE-S3/SSE-KMS is additional defense-in-depth (S3 backend
  only); for the FS backend, rely on OS-level disk encryption (LUKS).
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
  ADR-0007 (upgrade/multisig), ADR-0023 (per-round evidence hashes)
- `apps/evidence-daemon/EVIDENCE-FORMAT.md` §9 (per-round data format)
- `programs/accord/SPEC.md` (Evidence flow), `programs/accord/src/state.rs:33,265`
- `CONTEXT.md` — Evidence Operator
- `packages/sdk` — `@useaccord/sdk` (chain reader + types); `@useaccord/sdk/evidence` (evidence crypto protocol, ADR-0015)
