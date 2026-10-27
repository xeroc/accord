---
# accord-dyf0
title: Implement Bun+Hono server
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:43:50Z
parent: accord-s3ow
---

---

assigned: implementer

---

src/server/{app,routes}.ts + main.ts: wire ingest/deliver routes, TLS (EVIDENCE_TLS_*), per-IP rate limit (EVIDENCE_RATE_LIMIT_PER_MIN), optional X-Account-Key accounting-only. Stateless, HA-ready.

See milestone accord-yjno HANDOFF §2 for the shared contract (data types, crypto, edge cases, DoD).

## Summary of Changes

Implemented the Bun + Hono HTTP server for the Evidence Operator daemon as a
**dependency-injected, stateless** layer. The server owns HTTP concerns only
(routing, status/Location, per-IP rate limit, accounting-only key, TLS); it
consumes the ingest/deliver/health handlers via a `ServerDeps` seam so it
typechecks and tests in isolation from the not-yet-landed pipeline (beans
accord-r9km / accord-4swo / accord-u1pu). `main.ts` wires stub handlers that
503 until bean accord-zv7j (pipeline epic) lands its concrete handlers — a
one-function swap at the seam.

New files (`apps/evidence-daemon/`):

- `package.json`, `tsconfig.json` — package skeleton (`@accord/evidence-daemon`,
  bun, hono; lint = `tsc --noEmit`, test = `bun test`). SEAM shared with
  scaffold bean accord-qzca.
- `src/server/handlers.ts` — `ServerDeps`/`IngestHandler`/`DeliverHandler`/
  `HealthProbe` seam types + `EvidenceBundleInput`/`DeliveryPayload` shapes.
- `src/server/routes.ts` — `POST /evidence/:subaccord/:dispute`,
  `GET /evidence/:dispute/for/:juror`; base58 address guard → 400.
- `src/server/app.ts` — `createApp(deps, opts)`: per-IP fixed-window rate limit
  (429 + Retry-After, keyed on X-Forwarded-For), content-length cap (413),
  accounting-only X-Account-Key (never denies), `/healthz` stub mount.
- `src/config.ts` — minimal env parsing (port, TLS paths, rate limit, body cap,
  account-key flag). SEAM for config bean accord-11im.
- `src/main.ts` — wires stub deps, `Bun.serve` with optional TLS
  (EVIDENCE_TLS_CERT/KEY), warns on plain-HTTP dev.
- `src/server/app.test.ts` — 9 passing wiring self-checks (routing, status
  mapping, rate limit, accounting-only key, healthz).

### Verification

- `pnpm --filter @accord/evidence-daemon run lint` (tsc --noEmit): clean.
- `pnpm --filter @accord/evidence-daemon test` (bun test): 9 pass, 0 fail.
- Runtime boot smoke (EVIDENCE_PORT=18080): server starts, logs listening.

### Notes / handoffs for downstream beans

- Pipeline handlers (accord-zv7jm incl. accord-r9km ingest, accord-4swo
  deliver) implement `IngestHandler`/`DeliverHandler`; swap stubs in `main.ts`.
- `/healthz` real probe (S3+RPC) is bean accord-u1pu — replace the stub route.
- Rate limit is per-replica in-process (ceiling noted); a shared Redis limiter
  is an ops upgrade that does not change the handler contract.
- Full Test matrix §6 coverage belongs to bean accord-z50v (Test server).
