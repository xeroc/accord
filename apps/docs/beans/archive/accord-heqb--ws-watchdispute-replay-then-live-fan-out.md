---
# accord-heqb
title: WS /watch/:dispute — replay-then-live fan-out
status: completed
created_at: 2026-10-23T09:32:58Z
updated_at: 2026-10-23T10:55:07Z
parent: accord-0xih
---

src/server/watch.ts: Bun.serve websocket handlers + hono upgrade (server instance via closure); per-dispute subscriber Set + ring buffer (TRACE_BUFFER_PER_DISPUTE); on connect: hello + replay (store tail + ring buffer) then live frames; per-IP conn cap (TRACE_MAX_CLIENTS_PER_IP); ping/pong keepalive. RED→GREEN via bun ws client: connect mid-duty gets hello+replay+live, frames seq-ordered, cap enforced (second conn from same IP dropped when over).

## Summary of Changes

- `apps/evidence-daemon/src/server/watch.ts`:
  - `WatchHub` — single-replica fan-out state (ADR-0037): per-dispute subscriber `Set`, bounded drop-oldest ring (`bufferPerDispute`, default 512 = `TRACE_BUFFER_PER_DISPUTE`), per-IP connection counting (`maxClientsPerIp`, default 8 = `TRACE_MAX_CLIENTS_PER_IP`, atomic reserve-at-upgrade), keepalive sweep (ping/pong; terminates peers that missed their pong; interval unref'd).
  - `publish(dispute, envelopes)` — the ingest entry for bean accord-lmcc: ring push + immediate seal-visible send; sealed frames arm the shared `UnsealScheduler` (accord-0yxb) which re-fans out at `unsealAt`.
  - `onOpen` — hello → store tail (via the `TraceReplaySource` seam, store-down tolerated) ∪ ring replay, deduped by `juror:seq`, then subscribe; the ring-walk + subscribe are one synchronous tail so no publish can interleave (no missed/double frames). Every send funnels through one `sendTo` that applies `sealVisible` at send time — no path bypasses the predicate.
  - `websocketHandlers` (open/close/pong + no-op message; for `Bun.serve<WatchSocketData>`) and `watchRoutes(hub, getServer)` (GET `/watch/:dispute`: address guard, 404 without a server, 429 over the per-IP cap, 426 on failed upgrade; IP from `server.requestIP`, not spoofable XFF).
- `apps/evidence-daemon/src/server/watch.test.ts` — RED→GREEN, 7 tests against a real `Bun.serve` + real bun WS clients: mid-duty connect (hello + ring replay + live, seq-ordered); store tail ∪ ring replay without duplicates; sealed verdict withheld live AND on mid-window replay, flushed to live sockets at `unsealAt` and visible to later connects via the ring; per-IP cap drops the second same-IP connection; publish with no subscribers buffers without throwing; ping keepalive spares a pong-ing client; ring bounded drop-oldest. Verified stable across 3 consecutive runs.
- Docs: SPEC.md `GET /watch/{dispute}` (WS) API row + the ADR-0037 note narrowed to the still-unlanded legs (POST push leg, trace store); changeset extended.
- Verified: `bun test` 370 pass / 0 fail, `tsc --noEmit` clean, `eslint .` clean in evidence-daemon.
- main.ts wiring (mounting the hub + websocket handlers on the serving loop, gated on `TRACE_ENABLED`) deliberately left to bean accord-lmcc per its scope; the module is exercised end-to-end by the suite above on a test-spun server.
