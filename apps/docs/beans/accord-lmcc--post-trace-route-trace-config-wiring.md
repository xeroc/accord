---
# accord-lmcc
title: POST /trace route + TRACE config wiring
status: completed
type: task
created_at: 2026-10-23T09:32:57Z
updated_at: 2026-10-23T12:05:00Z
parent: accord-06nn
---

Route `POST /trace/:subaccord/:dispute/:juror` (ADDRESS guard pattern from routes.ts), body-cap reuse, `TRACE_ENABLED` (default false → 404), config in src/config.ts + .env.example, wiring in main.ts + ServerDeps. RED→GREEN: guard shapes, disabled 404, limits surface as 413, happy 201. TDD; tsc + lint green.

## Summary of Changes

- `src/server/routes.ts` — `POST /trace/:subaccord/:dispute/:juror` with ADDRESS guards on all three params, 256 KiB body cap measured on the raw body bytes (no Content-Length trust), JSON shape check, then delegation to `deps.traceIngest`; header route table updated.
- `src/server/handlers.ts` — `TraceIngestHandler`/`TraceIngestResult` seam (201 | 400 | 413) + required `ServerDeps.traceIngest`.
- `src/pipeline/trace.ts` — initial real ingest: envelope validation (`{v, seq, events, sig}`), 64-event cap, daemon-stamped `at`, write-through `appendBatch` into the TraceStore. Ed25519 sig verify + live `Round.jurors[]` gate land with accord-sith; route is default-off until then.
- `src/config.ts` + `.env.example` — `ServerConfig.traceEnabled` from `TRACE_ENABLED` (default false).
- `src/server/app.ts` — `AppOptions.traceEnabled` forwarded to `evidenceRoutes(deps, traceEnabled)`; disabled ⇒ 404 before any validation or store touch.
- `src/wire.ts` + `src/main.ts` — `WireDeps.traceStore` (fs/s3, same backend selection as the evidence store) → `traceIngest` handler; `traceEnabled: srv.traceEnabled` into `createApp`.
- Fixture ripple: `traceIngest` stubs in app/domain/health test deps; `memoryTraceStore()` + `traceStore:` in wire/synod-wire tests.
- Tests: `src/server/trace.test.ts` (9) — config default, disabled 404, guard 400s, invalid json 400, byte-cap 413, 64/65-event boundary, envelope 400s, happy 201 + durable read-back, idempotent re-append. Suite 371 pass, `tsc --noEmit` + eslint clean.
