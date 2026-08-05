---
# accord-vx8c
title: HA deployment artifacts
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-s3ow
blocked_by:
  - accord-dyf0
---

---

assigned: implementer

---

Dockerfile + systemd unit (or k8s manifest): N stateless replicas behind LB, shared EVIDENCE_KEYRING env + shared S3 bucket, retention sweep notes.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).

## Summary of Changes

Shipped the container image + HA Kubernetes manifest + a deployment guide
(ADR-0011 §HA). Every replica is identical: state derived from env
(`EVIDENCE_KEYRING` Secret) and the shared S3/MinIO bucket — no session
affinity, safe to scale horizontally.

New files (`apps/evidence-daemon/`):

- `Dockerfile` — `oven/bun:1.3-debian`, non-root `bun` user, no compile step
  (Bun runs TS directly), `HEALTHCHECK` on `GET /healthz`, plain-HTTP on 8080
  by default (TLS terminates at the LB/Ingress). Standalone `bun install
--production` with a ponytail note to switch to a workspace-aware build when
  `@accord/sdk` becomes a workspace dependency.
- `deploy/k8s.yaml` — 2-replica Deployment (pod anti-affinity to spread across
  nodes), ClusterIP Service, shared ConfigMap (non-secret runtime env) +
  Secret placeholder (keyring + S3 creds — injected by a secret manager, never
  committed), commented Ingress for TLS termination. Hardening per ADR-0006:
  `runAsNonRoot`, `readOnlyRootFilesystem` (+ `emptyDir` tmp mount),
  `drop: [ALL]` capabilities, `seccomp RuntimeDefault`. Liveness + readiness
  probes on `/healthz` (LB drains on 503). All 4 YAML docs parse with 0 errors.
- `deploy/README.md` — HA topology, shared-state model, secret handling,
  ADR-0006 hardening, TLS options, **retention sweep design**
  (`EVIDENCE_RETENTION_DAYS`, delete after `RulingFinalized`), and the systemd
  bare-metal alternative.

### Verification

- `pnpm --filter @accord/evidence-daemon lint` (tsc --noEmit): clean (no code
  change — deployment artifacts only).
- `deploy/k8s.yaml`: validated — 4 documents (ConfigMap, Secret, Deployment,
  Service), 0 parse errors; replicas=2, `tmp` volumeMount wired for
  readOnlyRootFilesystem.
- pre-commit hooks (check-yaml, no-large-files, detect-private-key): green on
  commit.

### Notes / handoffs

- **Retention sweep is documented, not yet executable.** It needs the chain
  reader (bean accord-h1v2, for `Dispute` finalization state) and
  `store.delete` (bean accord-udiu). The README describes the intended
  CronJob shape; the manifest lands with the retention command.
- Secrets (`EVIDENCE_KEYRING`, S3 creds) are an empty placeholder Secret —
  ops fills them via sealed-secrets/external-secrets/Vault; never committed.
- Image tag is `:latest` placeholder; set a real release tag in CI.
