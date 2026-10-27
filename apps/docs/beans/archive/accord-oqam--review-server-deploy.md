---
# accord-oqam
title: Review server-deploy
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-s3ow
blocked_by:
  - accord-z50v
---

---

assigned: reviewer

---

Verify stateless (no session affinity), auth is accounting-only, healthz drains correctly, deploy artifacts match HA model.

See milestone accord-yjno HANDOFF §3 §5 for the shared contract (data types, crypto, edge cases, DoD).

## Summary of Changes — Review report (verdict: PASS)

Read-only review of the server + deploy artifacts (beans accord-dyf0, u1pu,
vx8c, z50v) against the four claims and §3/§5. **No blocking defects.** Two
minor deferred-hardening items filed as draft `accord-bsgp`.

### Claims verified

1. **Stateless (no session affinity) — PASS.** Request handling holds no
   per-session state; any replica serves any request. The only in-process
   state is the per-replica rate-limit counter (`app.ts:47` `buckets` Map),
   explicitly documented as a per-replica ceiling (`app.ts:44-46`) — it
   softens, not breaks, the limit, and never affects request correctness.
2. **Auth is accounting-only — PASS.** `app.ts:50-54`: `X-Account-Key` is
   read and logged, never branched on for allow/deny. The contract suite
   proves it: request succeeds with no key, with any key value, and the key
   is ignored when disabled (`app.test.ts` "X-Account-Key" group, 4 tests).
3. **healthz drains correctly — PASS.** `app.ts:86-94` maps a degraded probe
   to `503`; `deploy/k8s.yaml` wires `readinessProbe` + `livenessProbe` on
   `/healthz`, so the LB drains/stops routing on 503. Probe logic
   (`health.ts`) pings Storage + RPC in parallel with a per-check timeout.
   Note: until the store (`accord-udiu`) + chain reader (`accord-h1v2`) wire
   real pings, `main.ts` stubs return false → `/healthz` is 503 → pods stay
   NotReady. This is correct (do not route to a pod that cannot serve), not
   a defect.
4. **Deploy artifacts match HA model — PASS.** `deploy/k8s.yaml`: 2 replicas
   (§5 DoD "≥2"), pod anti-affinity (spread across nodes), shared ConfigMap +
   Secret (`EVIDENCE_KEYRING` + S3 creds), shared S3 bucket — satisfies §5
   "shared env keyring + S3 bucket". Stateless container (non-root,
   readOnlyRootFilesystem + tmp mount, dropped caps) per §3/ADR-0006.

### §3 edge cases — server layer

- Pull + no-auth: confirmed — no auth gate exists anywhere.
- Never log secrets/plaintext: server logs only structured boot messages,
  `account-key`, and `ip`; no request bodies or key material. PASS.
- Integrity gate / unknown-operator → 404/409: the server faithfully reflects
  handler result codes (proven by the contract suite); gate _enforcement_ is
  the pipeline's job (accord-zv7j), correctly out of the server's scope.

### Findings (deferred — draft `accord-bsgp`, not auto-dispatched)

- **XFF trust** (`app.ts:30-35`): `peerIp` trusts `X-Forwarded-For`
  unconditionally. Fine behind a trusted LB/Ingress that overwrites it;
  spoofable if exposed directly. Documented inline.
- **Body-cap bypass** (`app.ts:56-61`): the `maxBytes` guard reads
  `Content-Length`; a client omitting it (chunked) bypasses the pre-handler
  cap. Default `EVIDENCE_MAX_EVIDENCE_BYTES=0` keeps this low-risk until
  configured. Mitigation in the draft.

### Evidence

- `pnpm --filter @accord/evidence-daemon run lint` (tsc --noEmit): clean.
- `pnpm --filter @accord/evidence-daemon test`: 31 pass / 0 fail (60 expects).

### Verdict

Server + deploy artifacts satisfy the HA/accounting/healthz/statelessness
contract for v1. Ship the epic's server lane; track `accord-bsgp` for the
two hardening follow-ups.
