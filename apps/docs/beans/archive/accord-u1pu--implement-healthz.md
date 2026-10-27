---
# accord-u1pu
title: Implement /healthz
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

GET /healthz: probe S3 (HEAD bucket) + RPC reachability → 200/503. LB drains on 503.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).

## Summary of Changes

Implemented the `/healthz` probe as an injected `HealthProbe` (replacing the
503 stub wired in bean accord-dyf0). The probe pings Storage + RPC in parallel
with a per-check timeout; ok iff both reachable, else 503 with a detail string
listing the failing backends. The existing `/healthz` route in `app.ts`
already maps the probe result → 200/503, so no route change was needed — the
deliverable is the concrete probe + its wiring in `main.ts`.

New/changed files (`apps/evidence-daemon/`):

- `src/server/health.ts` — `createHealthProbe({ storage, rpc, timeoutMs? })`:
  parallel checks, `withTimeout` (a timed-out check counts as unreachable),
  error isolation (a throwing check → degraded, not a crash). Returns the
  `HealthProbe` shape from `handlers.ts`.
- `src/main.ts` — wires `createHealthProbe` with stub storage/rpc pings
  (SEAM for beans accord-udiu / accord-h1v2) and `cfg.healthTimeoutMs`.
- `src/config.ts` — added `healthTimeoutMs` (`EVIDENCE_HEALTH_TIMEOUT_MS`,
  default 2000).
- `src/server/health.test.ts` — 7 probe self-checks: both-reachable, storage
  down, rpc throws (error captured in detail), rpc hangs (timeout → degraded),
  both fail (both listed), and 200/503 route mapping via `createApp`.

### Verification

- `pnpm --filter @accord/evidence-daemon run lint` (tsc --noEmit): clean.
- `pnpm --filter @accord/evidence-daemon test` (bun test): 17 pass, 0 fail
  (9 server wiring + 7 healthz + 1 config).
- Runtime smoke (EVIDENCE_PORT=18081): `GET /healthz` → `503 {"status":
"degraded","detail":"storage unreachable; rpc unreachable"}` (honest — stub
  pings report unreachable until the store/chain-reader beans wire real ones).

### Notes / handoffs

- Real `storage` ping (HEAD bucket) lands with S3Store (bean accord-udiu).
- Real `rpc` ping (e.g. `getHealth`) lands with the chain reader (bean
  accord-h1v2). Both are one-line swaps at the `main.ts` wiring site.
