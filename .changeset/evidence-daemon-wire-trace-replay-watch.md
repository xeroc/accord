---
"@useaccord/evidence-daemon": patch
---

evidence-daemon: wire the jury-telemetry read side into the composition root (ADR-0037; surface beans accord-0xih/accord-f6hh/accord-heqb)

- `GET /trace/{dispute}` 404ed `{"error":"trace replay not enabled"}` on every
  deployment: `createServerDeps` never wired `traceReplay`, so the route's
  unwired-seam guard fired unconditionally — the store was never touched.
  `TRACE_ENABLED=true` only arms POST ingest; it never gated replay.
- `WS /watch/{dispute}` was equally dead: `WatchHub`/`watchRoutes`/
  `websocketHandlers` existed and were unit-tested but `main.ts` never mounted
  them. Now mounted, with ingest fan-out wired (`traceFanout` → `hub.publish`)
  so live frames reach subscribers.
- New env knobs documented in SPEC but never parsed: `TRACE_BUFFER_PER_DISPUTE`
  and `TRACE_MAX_CLIENTS_PER_IP` (defaults 512 / 8; malformed values fail loud
  at boot).
- New `src/wire.test.ts` pins the composition: full deps over real fs stores →
  `GET /trace` must answer 200, not the unwired-seam 404.
