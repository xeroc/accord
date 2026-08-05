# Evidence Operator daemon — deployment

Stateless, HA-ready deployment artifacts for the Evidence Operator daemon
(ADR-0011). Every replica is identical and derives all state from env
(`EVIDENCE_KEYRING`) and the shared S3/MinIO bucket.

## Files

- `../Dockerfile` — image: non-root `bun` runtime, `/healthz` HEALTHCHECK.
- `k8s.yaml` — 2-replica Deployment + ClusterIP Service (+ Ingress stub),
  shared ConfigMap + Secret, pod anti-affinity, liveness/readiness probes.

## High availability

- **N stateless replicas** behind a TCP/TLS load balancer (k8s Service +
  Ingress, or an external LB). Delivery is a pure function of
  `(bundle, juror_pubkey, operator_key)`; ingest is an object PUT — no
  session affinity needed.
- **Shared state:** all replicas receive the same `EVIDENCE_KEYRING` (Secret)
  and point at the same S3/MinIO bucket (ConfigMap). No per-replica state.
- **Health:** `GET /healthz` probes S3 (HEAD bucket) + RPC reachability
  (bean accord-u1pu). The LB drains (stops routing) on `503`.
- **TLS:** terminated at the Ingress/LB by default. For end-to-end TLS, mount
  a TLS Secret into the pod and set `EVIDENCE_TLS_CERT` / `EVIDENCE_TLS_KEY`.

## Secrets (never committed)

`EVIDENCE_KEYRING` and the S3 credentials are injected out-of-band via your
secret manager (sealed-secrets / external-secrets / Vault). The
`evidence-daemon-secret` Secret in `k8s.yaml` is an empty placeholder.

## Hardening (ADR-0006 — trusted component)

- Container runs as non-root `bun`; `readOnlyRootFilesystem`; all capabilities
  dropped; `seccompProfile: RuntimeDefault`.
- No core dumps: enforced by the host kernel `core_pattern` (ops concern);
  belt-and-suspenders via the runtime `prlimit` (set `--ulimit core=0:0` for a
  standalone container runtime).
- `k_evidence` (per-Subaccord) lives only in process memory, sourced from env
  injected by the orchestrator — never in the image, never logged.

## Retention sweep (EVIDENCE_RETENTION_DAYS)

Plaintext is **never** persisted, but ciphertext objects accumulate. The
design (ADR-0011 §Deployment / failure modes) deletes an object
`EVIDENCE_RETENTION_DAYS` after its dispute reaches `RulingFinalized`.

**Not yet wired** — the sweep needs the chain reader (bean accord-h1v2, to
read `Dispute` finalization state) and `store.delete` (bean accord-udiu),
neither of which is implemented in v1 of the server epic. Intended shape:

```
# A CronJob that, for each stored object key {subaccord}/{dispute}:
#   1. reads the Dispute on-chain; if state >= Finalized AND
#      now - finalized_at > EVIDENCE_RETENTION_DAYS → store.delete()
#   2. else keep.
#
# Schedule: daily. Stateless — safe to run from any replica / a dedicated pod.
```

A `CronJob` manifest will land alongside the retention command once the
chain reader + store-delete are available. Until then, retention is manual
(`mc rm` / `aws s3 rm` by key prefix).

## Alternative: systemd

For bare-metal / VM deployment, the equivalent is a systemd unit running the
container (or `bun run src/main.ts` directly) with `EnvironmentFile=` pointing
at a root-readable env file (0600, dedicated service user). The same env vars
apply; a reverse proxy (nginx/caddy) terminates TLS and load-balances N
instances. No k8s-specific dependency exists in the daemon code.
