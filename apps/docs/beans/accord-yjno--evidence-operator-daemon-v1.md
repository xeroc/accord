---
# accord-yjno
title: Evidence Operator Daemon (v1)
status: todo
type: milestone
priority: high
created_at: 2026-08-05T14:21:09Z
updated_at: 2026-08-05T14:31:34Z
---

## Evidence Operator Daemon (v1)

Realizes the Evidence Operator role (ADR-0006) as a standalone off-chain
TypeScript/Bun **application** at `apps/evidence-daemon`. Decision: ADR-0011.
Build spec: `apps/evidence-daemon/SPEC.md`.

The daemon ingests claimant ciphertexts, decrypts, and re-encrypts to drawn
Jurors on demand (pull, no auth). **Evidence-only — no governance.** HA
stateless replicas, per-Subaccord keyring (env), S3/MinIO store (ciphertext
only — plaintext never persisted).

## HANDOFF

### 1. Happy Path

1. Claimant encrypts evidence to the Subaccord's `evidence_operator` X25519 key
   (Ed25519→X25519 conversion), posts bundle to `POST /evidence/{subaccord}/{dispute}`.
2. Daemon validates `plaintext_hash == Dispute.evidence_hash`, stores the
   **ciphertext** bundle to S3/MinIO (key `{subaccord}/{dispute}`).
3. `draw` selects jurors (on-chain). Daemon learns via `JurorsDrawn` / live
   `Round.jurors[]` read.
4. Juror calls `GET /evidence/{dispute}/for/{juror}`. Daemon confirms
   `juror ∈ Round.jurors[]`, loads the ciphertext bundle, decrypts **in memory**,
   integrity-gates, re-encrypts to the juror's X25519 key, returns
   `{ out, operator_ephem_pub }`. Plaintext is discarded.
5. Juror decrypts, verifies `sha256 == evidence_hash`, reviews, votes.

### 2. Data Contract

- HTTP: `POST /evidence/{subaccord}/{dispute}` (EvidenceBundle → 201/409);
  `GET /evidence/{dispute}/for/{juror}` (→ 200 `{out, operator_ephem_pub}` /
  404 / 409); `GET /healthz`.
- `EvidenceBundle`: `{ ct, claimant_ephem_pub, wrapped, plaintext_hash, ingested_at }`
  — **ciphertext only**; no plaintext field.
- Traits: `EvidenceStore` (v1: `S3Store` — S3/MinIO, key `{subaccord}/{dispute}`,
  idempotent on `plaintext_hash`), `Keyring` (v1: `EnvKeyring` —
  `EVIDENCE_KEYRING` comma-separated raw secrets → `Map<pubkey, sk>`;
  Subaccord→key resolved at runtime via on-chain `evidence_operator`),
  `Watermark` (no-op v1).
- Modules: `src/{config,keys,crypto,store,chain,pipeline,server,main}.ts`.
- Reads via `@accord/sdk`: `Subaccord`, `Dispute`, `Round`. Writes nothing on-chain.

### 3. Edge Cases & Constraints

- Daemon is **trusted** (sees plaintext in memory) — ADR-0006. Never log
  secrets/plaintext; no core dumps.
- **Encrypted-at-rest invariant:** S3/MinIO holds ciphertext only; plaintext
  exists ephemerally in memory during delivery and is never persisted.
- `k_evidence` raw in-process, sourced from `EVIDENCE_KEYRING` env (KISS stopgap;
  `Keyring` trait enables file/KMS migration). Env injected by orchestrator,
  never committed.
- Pull + no-auth: confidentiality rests on Juror-bound re-encryption, **not**
  request auth. Do NOT add auth "for security" — an API key is accounting only.
- Integrity gate is mandatory at ingest AND delivery (`sha256 == evidence_hash`).
- Unknown operator (`Subaccord.evidence_operator` not in keyring map) → `404`.
- Permanent operator failure: rotate `evidence_operator` via Squads multisig
  (48h timelock); pending old-key bundles unrecoverable — accepted gap.
- **No governance signing in this daemon** (`authority` = Squads UI, ADR-0011).

### 4. Business Logic (pseudo-code)

```
deliver(dispute, juror):
  sub = chain.readSubaccord(dispute.subaccord)
  sk  = keyring.forOperator(sub.evidence_operator)       // else 404
  b   = store.get(dispute.subaccord, dispute)            // ciphertext only
  require Round.jurors[].contains(juror) AND dispute.state >= Drawn
  dek = AES-GCM.dec(HKDF(X25519(EdToX25519(sk), b.claimant_ephem_pub)), b.wrapped)
  pt  = AES-GCM.dec(dek, b.ct)                           // in-memory only
  require sha256(pt) == dispute.evidence_hash
  wm  = Watermark.apply(pt, juror)                       // no-op v1
  k   = HKDF(X25519(ephem, Ed25519ToX25519(juror)))
  return { AES-GCM.enc(k, wm), X25519_pub(ephem) }       // pt discarded
```

### 5. Definition of Done

- [ ] crypto round-trip unit tests green (Ed↔X25519, ECIES, integrity gate)
- [ ] `EnvKeyring` map + runtime operator-resolution tests green
- [ ] `S3Store` tests: put/get round-trip, idempotency, never-plaintext invariant
- [ ] pipeline tests: ingest happy/hash-mismatch/idempotent; deliver
      happy/not-drawn/premature/gate-fail/unknown-operator
- [ ] e2e vs Surfpool: create_dispute → draw → juror fetch → decrypt → verify hash
- [ ] HA: ≥2 stateless replicas behind a LB, shared env keyring + S3 bucket
- [ ] `/healthz` probes S3 + RPC
- [ ] lint clean (`pnpm --filter @accord/evidence-daemon run lint:fix`)

### 6. Test Matrix (Given / When / Then)

- Given a posted bundle, When GET by a drawn juror, Then 200 + decryptable by that juror key only.
- Given a posted bundle, When GET by a non-drawn juror, Then 404.
- Given a posted bundle, When GET before draw, Then 404.
- Given a Subaccord whose operator is not in the keyring, When any request, Then 404.
- Given a tampered bundle (hash mismatch), When GET, Then 409 + alert.
- Given the same `plaintext_hash` re-POSTed, Then idempotent (no duplicate object).
- Given any stored object, When inspected, Then it is ciphertext (no plaintext ever persisted).
- Given a non-juror key, When attempting to decrypt a delivered bundle, Then fails.

### 7. Open Questions

- Retention window length (`EVIDENCE_RETENTION_DAYS`) — TBD (ops/legal).
- SSE-S3 vs SSE-KMS for the S3 bucket — TBD at deploy.
- Epic/task breakdown for fleet dispatch — created below this milestone.
