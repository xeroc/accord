---
"@useaccord/evidence-daemon": patch
---

evidence-daemon: `POST /trace/:subaccord/:dispute/:juror` route + `TRACE_ENABLED` config wiring (ADR-0037, bean accord-lmcc) — ADDRESS-guards on all three path params, 256 KiB body cap measured on raw body bytes (no Content-Length trust), envelope shape + 64-event cap + durable append in the new `src/pipeline/trace.ts` ingest over the TraceStore seam (bean accord-flxc), wired through `WireDeps.traceStore` → `ServerDeps.traceIngest` → `createApp({ traceEnabled })`. Default off (`TRACE_ENABLED=false` ⇒ 404 before any validation or store touch); the Ed25519 sig verify + live `Round.jurors[]` gate land with accord-sith. The lockstep bump for the rest of the workspace comes from the fixed group.
