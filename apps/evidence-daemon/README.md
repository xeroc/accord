# Evidence Operator Daemon

The **Evidence Operator Daemon** (`@useaccord/evidence-daemon`) is the standalone, off-chain TypeScript/Bun service that realizes the **Evidence Operator** role in the Accord arbitration protocol (ADR-0006, ADR-0011). It is the trusted component that:

1. **Receives** a claimant's encrypted `EvidenceBundle` at dispute-file time.
2. **Decrypts** it in memory (never persisted).
3. **Integrity-gates** the plaintext against the on-chain `evidence_hash`.
4. **Re-encrypts** it on demand to each **drawn** Juror's pubkey and serves it over a pull HTTP API.

The on-chain program stores only `evidence_hash`; this daemon holds the only copy of the decryption key and the ciphertext. It signs nothing on-chain and writes nothing to the chain — all reads are via `@useaccord/sdk`.

> [!IMPORTANT]
> **Encrypted-at-rest invariant (non-negotiable):** plaintext is never persisted. The storage backend (S3/MinIO or local filesystem) holds ciphertext objects only. Decrypt → re-encrypt happens **in memory per request** and is discarded immediately. (ADR-0006)

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [HTTP API](#http-api)
- [Configuration](#configuration)
- [Available Scripts](#available-scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Model](#security-model)
- [Troubleshooting](#troubleshooting)
- [Further Reading](#further-reading)

---

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) 1.3+ (TypeScript executed directly — no compile step)
- **Language:** TypeScript 5.5+ (strict)
- **HTTP framework:** [Hono](https://hono.dev) v4
- **Solana client:** [`@solana/kit`](https://github.com/anza-xyz/kit) v7 (read-only)
- **Object storage:** [`@aws-sdk/client-s3`](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/) (S3/MinIO) or the local filesystem (`node:fs`) — selectable via `EVIDENCE_STORAGE`
- **Container:** `oven/bun:1.3-debian` (non-root, no new privileges)
- **Package manager:** pnpm (workspace) / bun (runtime)

---

## Prerequisites

- [Bun](https://bun.sh/docs/installation) 1.3 or higher
- Access to a Solana RPC endpoint (mainnet, devnet, or a local Surfpool instance — read-only is sufficient)
- A ciphertext storage backend (pick one via `EVIDENCE_STORAGE`):
  - **S3-compatible** (`EVIDENCE_STORAGE=s3`, default): AWS S3, MinIO, Cloudflare R2, etc.
  - **Local filesystem** (`EVIDENCE_STORAGE=fs`): any writable directory — handy for local dev / single-node self-hosting.
- A 32-byte Ed25519 seed for each Subaccord you operate (see [`EVIDENCE_KEYRING`](#EVIDENCE_KEYRING))
- The Accord program deployed at a known `EVIDENCE_PROGRAM_ID`

> For local development, run [Surfpool](https://surfpool.dev) (`make run_surfpool` from the repo root) to get a local Solana RPC + deployed Accord program.

---

## Getting Started

### 1. Install Dependencies

From the repo root (the daemon is part of a pnpm workspace):

```bash
make prep            # installs Solana, Anchor, and runs pnpm install
# — or —
pnpm install
```

To install only this package's deps in isolation:

```bash
cd apps/evidence-daemon
bun install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in the [required values](#configuration). At minimum:

```ini
EVIDENCE_RPC_URL=http://127.0.0.1:8899
EVIDENCE_PROGRAM_ID=<deployed Accord program id>
EVIDENCE_KEYRING=<base58 32-byte Ed25519 seed>
EVIDENCE_PORT=8080

# Pick ONE backend:
#   S3/MinIO (default):
EVIDENCE_STORAGE=s3
EVIDENCE_S3_ENDPOINT=http://localhost:9000
EVIDENCE_S3_BUCKET=accord-evidence
EVIDENCE_S3_REGION=us-east-1

#   Local filesystem (no S3 credentials needed):
# EVIDENCE_STORAGE=fs
# EVIDENCE_FS_ROOT_DIR=/var/lib/evidence
```

> [!CAUTION]
> **Never commit `.env`.** `EVIDENCE_KEYRING` is the crown-jewel secret — anyone holding it can decrypt every evidence bundle for the operated Subaccords. Inject it via your orchestrator's secret manager in production.

### 3. Run the Daemon

```bash
bun run src/main.ts
# — or —
pnpm start
# — or, with watch mode for development —
pnpm dev
```

You should see a single JSON log line:

```json
{ "msg": "evidence-daemon listening", "port": 8080, "tls": false, "operators": 1 }
```

### 4. Smoke-Test Health

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

A `503` means S3 or the RPC is unreachable; see [`/healthz`](#get-healthz).

---

## How It Works

### Request Lifecycle

```
┌──────────────┐   POST /evidence/{sa}/{dispute}        ┌─────────────────┐
│   Claimant   │ ─────────────────────────────────────▶ │  evidence-daemon │
└──────────────┘  encrypted EvidenceBundle (ciphertext) └─────────────────┘
                                                          │
                                       integrity-gate vs. │ on-chain
                                       evidence_hash      │ evidence_hash
                                                          ▼
                                                ┌──────────────────┐
                                                │  S3 / MinIO / FS │
                                                │  (ciphertext)    │
                                                └──────────────────┘
                                                          ▲
┌──────────────┐   GET /evidence/{dispute}/for/{juror}    │
│    Juror     │ ─────────────────────────────────────▶ │
└──────────────┘
        ▲   200 { rounds: [{ out, operator_ephem_pub }] }
        │   re-encrypted to THIS juror's X25519 pubkey
        │                                                 │
        └─────────────────────────────────────────────────┘
         decrypt in memory → re-encrypt → discard plaintext
```

### Crypto Model

One key per Subaccord, dual-used via the standard Ed25519↔X25519 scalar conversion (libsodium `crypto_sign_ed25519_sk_to_curve25519`). The on-chain `evidence_operator` field is an Ed25519 pubkey; its Montgomery form is the X25519 encryption pubkey. Claimants only need the on-chain field.

**Ingest (claimant → operator):**

```
dek        = randomBytes(32)
ct         = AES-256-GCM.encrypt(dek, plaintext)
ephem_sk   = random X25519 secret
op_x25519  = Ed25519ToX25519(evidence_operator_pubkey)
shared     = X25519(ephem_sk, op_x25519)
k          = HKDF-SHA256(shared, info="accord-ingest-v1")
wrapped    = AES-256-GCM.encrypt(k, dek)
bundle     = { ct, claimant_ephem_pub, wrapped, plaintext_hash: sha256(plaintext) }
```

`plaintext_hash` **must** equal the dispute's on-chain `evidence_hash`. The daemon enforces this at ingest and again at delivery (tamper gate).

**Delivery (operator → drawn juror):**

```
op_sk_x25519 = Ed25519ToX25519Secret(operator_ed25519_sk)
shared_in    = X25519(op_sk_x25519, bundle.claimant_ephem_pub)
k_in         = HKDF-SHA256(shared_in, info="accord-ingest-v1")
dek          = AES-256-GCM.decrypt(k_in, bundle.wrapped)
plaintext    = AES-256-GCM.decrypt(dek, bundle.ct)        // in-memory only
# re-encrypt to juror (ECIES) — fresh ephemeral key per delivery
```

> [!NOTE]
> The ECIES / AES-256-GCM / HKDF-SHA256 / Ed↔X25519 protocol lives in **`@useaccord/sdk/evidence`** (ADR-0015), not in this daemon. The daemon imports it; nothing hand-rolled.

### Architecture

```
apps/evidence-daemon/
├── src/
│   ├── main.ts              # Composition root: env → modules → Bun.serve
│   ├── config.ts            # Twelve-factor env parsing (required/optional)
│   ├── wire.ts              # Adapters between HTTP, pipeline ports, and real modules
│   ├── keys/
│   │   └── keyring.ts       # EnvKeyring — base58 seeds → pubkey-indexed map
│   ├── store/
│   │   ├── store.ts         # EvidenceStore trait (Address-typed)
│   │   ├── s3.ts            # S3/MinIO backend (default)
│   │   └── fs.ts            # Local filesystem backend (EVIDENCE_STORAGE=fs)
│   ├── chain/
│   │   ├── reader.ts        # Read-only Subaccord/Dispute/Round via @useaccord/sdk
│   │   └── events.ts        # Log subscriber (DisputeCreated/JurorsDrawn/RulingFinalized)
│   ├── pipeline/
│   │   ├── ingest.ts        # POST handler: validate + integrity-gate + store.put
│   │   ├── deliver.ts       # GET handler: store.get + chain read + decrypt + gate + re-encrypt
│   │   └── watermark.ts     # Watermark trait (no-op in v1)
│   └── server/
│       ├── app.ts           # Hono app: rate limit, X-Account-Key, body cap, /healthz
│       ├── routes.ts        # /evidence routes
│       ├── handlers.ts      # ServerDeps contract
│       └── health.ts        # /healthz probe (S3 + RPC reachability)
├── tests/                   # Bun tests (see Testing below)
├── deploy/                  # k8s.yaml + deploy/README.md
├── Dockerfile
├── .env.example             # ← you are here
├── SPEC.md                  # Full v1 build spec (authoritative on intent)
└── EVIDENCE-FORMAT.md       # Wire format reference
```

The daemon is **stateless**: every replica is identical and derives all state from `EVIDENCE_KEYRING` (env) and the shared storage backend (S3 bucket or FS root). Run N replicas behind a TLS-terminating load balancer — no session affinity required (S3 backend; the FS backend is single-node).

---

## HTTP API

All routes are TLS-only in production. Rate-limited per peer IP. An optional `X-Account-Key` header is **accounting only** — it never grants or denies access (confidentiality rests on Juror-bound re-encryption).

### `POST /evidence/{subaccord}/{dispute}[/{round}]`

Upload an encrypted `EvidenceBundle`. `round` defaults to `0` (filer evidence); appeal rounds `1..MAX_APPEALS` post under ADR-0023.

**Request body** (JSON, base64 fields, **no plaintext field exists**):

```json
{
  "ct": "<base64 AES-256-GCM ciphertext of plaintext>",
  "claimant_ephem_pub": "<base64 X25519 ephemeral pubkey>",
  "wrapped": "<base64 AES-256-GCM ciphertext of the DEK>",
  "plaintext_hash": "<base64 sha256(plaintext)> — must equal on-chain evidence_hash"
}
```

**Responses:**

| Status | Meaning                                                                 |
| ------ | ----------------------------------------------------------------------- |
| `201`  | Stored. `Location: /evidence/{subaccord}/{dispute}/{round}`             |
| `400`  | Malformed bundle or invalid base58 address                              |
| `409`  | A different `plaintext_hash` already exists for this `(dispute, round)` |

### `GET /evidence/{dispute}/for/{juror}`

Pull all deliverable evidence packages for a drawn juror.

**Responses:**

| Status | Meaning                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------------------------------- |
| `200`  | `{ rounds: [{ round, out, operator_ephem_pub }] }` — every non-zero `evidence_hashes[0..=N]` for the juror's round `N` |
| `404`  | Juror not drawn, dispute not yet in Drawn state, or unknown operator                                                   |
| `409`  | Integrity gate failed (stored plaintext ≠ on-chain `evidence_hash`) — quarantined                                      |

**Delivery preconditions (enforced via live `Round` account reads):**

- `Dispute.state` ≥ Drawn for the current round
- `{juror}` ∈ `Round.jurors[]` for that round
- A bundle exists for each `(dispute.subaccord, dispute, round)` where `evidence_hashes[round]` is non-zero and `round ≤ juror's round`

### `GET /healthz`

Probes the storage backend (S3 HEAD bucket, or `stat` on the FS root) and RPC reachability. Returns `200 {"status":"ok"}` or `503 {"status":"degraded","detail":...}`. The load balancer should drain on `503`.

---

## Configuration

All configuration is twelve-factor — no secrets in code. See [`.env.example`](.env.example) for a copy-pasteable template.

### Required

| Variable                                        | Description                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVIDENCE_RPC_URL`                              | Solana RPC endpoint. Read-only is sufficient.                                                                                                                                                                                                |
| `EVIDENCE_PROGRAM_ID`                           | Deployed Accord program id (base58).                                                                                                                                                                                                         |
| <a id="EVIDENCE_KEYRING"></a>`EVIDENCE_KEYRING` | Comma-separated **base58-encoded 32-byte Ed25519 seeds** (one per operated Subaccord). The on-chain `Subaccord.evidence_operator` pubkey is the binding — the daemon derives each seed's pubkey and indexes by it. Unknown operator ⇒ `404`. |
| `EVIDENCE_STORAGE`                              | Ciphertext backend selector: `s3` (default — S3/MinIO) or `fs` (local filesystem). Only the selected backend's vars are required.                                                                                                            |

### Conditionally Required

| Variable                                                      | Notes                                                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `EVIDENCE_S3_ENDPOINT` / `EVIDENCE_S3_BUCKET` / `EVIDENCE_S3_REGION` | Required when `EVIDENCE_STORAGE=s3`. Ignored when `fs`. MinIO: set region to any value.       |
| `EVIDENCE_FS_ROOT_DIR`                                        | Required when `EVIDENCE_STORAGE=fs`. Absolute path to the evidence directory; created on first put. Single-node only. Ignored when `s3`. |
| `EVIDENCE_S3_ACCESS_KEY_ID` / `EVIDENCE_S3_SECRET_ACCESS_KEY` | Set **both together** when not using IAM/IRSA. Omit both for IAM.                                     |
| `EVIDENCE_TLS_CERT` / `EVIDENCE_TLS_KEY`                      | Paths to PEM files. Set **both together** for end-to-end TLS. Terminate at the LB/Ingress by default. |

### Optional

| Variable                       | Default                            | Description                                                                                           |
| ------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `EVIDENCE_PORT`                | `443` (code) / `8080` (Dockerfile) | Listen port.                                                                                          |
| `EVIDENCE_S3_FORCE_PATH_STYLE` | `false`                            | `true` for MinIO (s3 backend only).                                                                   |
| `EVIDENCE_RATE_LIMIT_PER_MIN`  | `0` (disabled)                     | Per-IP requests/min. `0` disables the limiter.                                                        |
| `EVIDENCE_MAX_EVIDENCE_BYTES`  | `0` (no cap)                       | Request body size cap in bytes.                                                                       |
| `EVIDENCE_RETENTION_DAYS`      | unset                              | Delete ciphertext N days after `RulingFinalized`. Sweep not yet wired in v1.                          |
| `EVIDENCE_HEALTH_TIMEOUT_MS`   | `2000`                             | Per-backend (S3 + RPC) health-probe timeout.                                                          |
| `EVIDENCE_ACCOUNT_KEY_ENABLED` | `false`                            | `true` ⇒ log `X-Account-Key` for accounting. Never denies.                                            |
| `EVIDENCE_TRUST_PROXY`         | `false`                            | `true` ⇒ honor `X-Forwarded-For` for rate limiting. **Only** behind a trusted LB that overwrites XFF. |
| `EVIDENCE_CORS_ORIGIN`         | `*`                                | `Access-Control-Allow-Origin` value. Set to a specific origin to restrict cross-origin access.        |

> [!WARNING]
> `EVIDENCE_TRUST_PROXY=true` is unsafe in front of an untrusted network — a direct client can spoof `X-Forwarded-For` to evade the per-IP rate limit. Only enable behind an Ingress/LB you control.

---

## Available Scripts

| Command                              | Description                                                               |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `pnpm start` / `bun run src/main.ts` | Start the daemon.                                                         |
| `pnpm dev`                           | Start with `bun --watch` (auto-restart on file change).                   |
| `pnpm build`                         | Type-check only (`tsc --noEmit`). Bun runs TS directly — no compile step. |
| `pnpm lint`                          | ESLint.                                                                   |
| `pnpm lint:fix`                      | ESLint with `--fix`.                                                      |
| `pnpm test`                          | Bun test suite.                                                           |
| `pnpm clean`                         | Remove build artifacts.                                                   |

---

## Testing

Tests live in [`tests/`](tests/) and alongside source files as `*.test.ts`. The suite is pure Bun test — no external validator required for unit/pipeline tests.

```bash
pnpm test                           # run everything
bun test tests/keyring.test.ts      # one file
bun test --filter "ingest"          # by name pattern
```

### Test Modules

| File                        | Covers                                                                            |
| --------------------------- | --------------------------------------------------------------------------------- |
| `tests/crypto.test.ts`      | `EnvKeyring` ↔ `@useaccord/sdk/evidence` integration; Ed25519↔X25519 round-trips. |
| `tests/keyring.test.ts`     | `EnvKeyring.fromEnv` parsing + validation.                                        |
| `tests/pipeline.test.ts`    | ingest + deliver against a stub chain reader and in-memory store.                 |
| `tests/watermark.test.ts`   | No-op watermark trait.                                                            |
| `tests/reader.test.ts`      | Chain reader over RPC.                                                            |
| `tests/events.test.ts`      | Log subscriber.                                                                   |
| `src/server/app.test.ts`    | HTTP layer: rate limit, body cap, X-Account-Key, /healthz.                        |
| `src/server/health.test.ts` | Liveness probe logic.                                                             |
| `src/store/s3.test.ts`      | S3 store put/get/exists/conflict.                                                 |
| `src/store/fs.test.ts`      | Filesystem store put/get/exists/conflict (mirrors s3.test.ts).                    |

---

## Deployment

### Docker

```bash
docker build -t evidence-daemon .
docker run -p 8080:8080 \
  --env-file .env \
  -v $(pwd)/tls:/tls:ro \
  evidence-daemon
```

The image is `oven/bun:1.3-debian`, runs as non-root user `bun`, and ships a `HEALTHCHECK` on `/healthz`.

### Kubernetes

A 2-replica Deployment + ClusterIP Service + Ingress stub lives in [`deploy/k8s.yaml`](deploy/k8s.yaml). Apply with:

```bash
kubectl apply -f deploy/k8s.yaml
```

The manifest uses a ConfigMap for non-secret config and an empty Secret placeholder (`evidence-daemon-secret`) that **must** be filled out-of-band via your secret manager (sealed-secrets / external-secrets / Vault). See [`deploy/README.md`](deploy/README.md) for the full HA topology, TLS strategy, and hardening notes.

### High Availability

- **N stateless replicas** behind a TCP/TLS load balancer. No session affinity.
- **Shared state:** all replicas share the same `EVIDENCE_KEYRING` (Secret) and the same storage backend (S3 bucket or a shared FS volume). The FS backend is single-node only — for HA, use S3.
- **Health:** `/healthz` probes the storage backend + RPC reachability. LB drains on `503`.
- **TLS:** terminated at the Ingress/LB by default. For end-to-end TLS, mount a TLS Secret and set `EVIDENCE_TLS_CERT` / `EVIDENCE_TLS_KEY`.

### Bare-Metal / VM (systemd)

A systemd unit running the container (or `bun run src/main.ts` directly) with `EnvironmentFile=` pointing at a root-readable env file (`0600`, dedicated service user). A reverse proxy (nginx/caddy) terminates TLS and load-balances N instances. No k8s-specific dependency exists in the daemon code.

---

## Security Model

> [!IMPORTANT]
> The daemon is a **trusted** component (ADR-0006): it sees plaintext in memory during delivery. Mitigations: open-source, attributability, per-Juror watermarking in v1.1.

- **`k_evidence` (per-Subaccord) is the crown jewel.** v1 holds it raw in-process, sourced from env (ADR-0011). Hardening: minimal process privileges, dedicated service user, no secret/plaintext logging, no core dumps, env injected by the orchestrator (never committed). The `Keyring` trait enables a file/KMS migration without touching callers.
- **Encrypted-at-rest:** the storage backend (S3/MinIO or local FS) holds application-level ciphertext; plaintext exists only ephemerally in memory during delivery. SSE-S3/SSE-KMS is additional defense-in-depth (S3 backend only). For the FS backend, rely on OS-level disk encryption (LUKS) for at-rest protection of the ciphertext directory.
- **Raw secrets in env is an explicit v1 stopgap.** Env vars can leak via `/proc/<pid>/environ`, crash dumps, and process listings. Mitigate v1 with a dedicated service user and orchestrator-injected secrets.
- **DoS:** public read endpoint. Per-IP rate limit, response-size cap, optional accounting-only API key. No auth path exists to brute-force.
- **TLS is mandatory in production** — ciphertext is the confidentiality layer, but TLS prevents metadata/traffic analysis and request enumeration.
- **Operator key compromise:** rotate `evidence_operator` on-chain via the Squads multisig (`UpdatePayload::EvidenceOperator`, 48h timelock). Pending disputes encrypted to the old key are unrecoverable — accepted (ADR-0011); claimants re-file or take the fee-refund path.

---

## Troubleshooting

### Daemon Refuses to Boot

`loadConfig` throws on any missing required var or malformed integer — the daemon never boots into a silently-404s-everything state. The error names the exact variable. Double-check `.env` against [`.env.example`](.env.example).

### `EVIDENCE_KEYRING` errors

- _"must contain at least one non-empty base58 Ed25519 secret"_ — the var is empty or only commas.
- _"decoded to N bytes, expected a 32-byte Ed25519 seed"_ — you provided a full 64-byte secret key or a keypair JSON. The daemon wants the **32-byte seed** in base58.

### `/healthz` returns `503`

- **S3 unreachable:** verify `EVIDENCE_S3_ENDPOINT`, `EVIDENCE_S3_BUCKET`, and credentials. For MinIO, set `EVIDENCE_S3_FORCE_PATH_STYLE=true`. Tune timeout via `EVIDENCE_HEALTH_TIMEOUT_MS`.
- **FS backend unreachable:** verify `EVIDENCE_FS_ROOT_DIR` exists and is writable by the daemon process. The root is created on boot; a missing/unmounted volume makes the probe fail.
- **RPC unreachable:** verify `EVIDENCE_RPC_URL` with `curl "$EVIDENCE_RPC_URL" -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'`.

### `404` on Delivery

- Juror not in `Round.jurors[]` for the current round (live account read).
- Dispute not yet in Drawn state.
- Subaccord's `evidence_operator` not in the keyring map — the daemon does not operate this Subaccord.

### `409` on Delivery

Integrity gate failed: stored plaintext ≠ on-chain `evidence_hash`. The object is quarantined. Investigate tampering or a stale on-chain hash.

### Rate Limit Not Working Behind a Proxy

Set `EVIDENCE_TRUST_PROXY=true` **only** behind a trusted LB/Ingress that overwrites `X-Forwarded-For`. Otherwise the daemon sees every request as the same peer ("unknown") and the per-IP bucket is shared globally.

---

## Further Reading

- [`SPEC.md`](SPEC.md) — Full v1 build specification. Authoritative on intent.
- [`EVIDENCE-FORMAT.md`](EVIDENCE-FORMAT.md) — Wire format reference for the `EvidenceBundle`.
- [`deploy/README.md`](deploy/README.md) — HA deployment topology, TLS, hardening, retention sweep.
- Repo-root [`AGENTS.md`](../../AGENTS.md) — monorepo conventions, build commands, change-coupling rules.
- ADRs (in `apps/docs/adr/accord/`):
  - **ADR-0006** — Evidence model (trusted operator)
  - **ADR-0011** — Evidence Operator Daemon (this service)
  - **ADR-0015** — Evidence crypto → `@useaccord/sdk/evidence`
  - **ADR-0023** — Per-round evidence delivery
