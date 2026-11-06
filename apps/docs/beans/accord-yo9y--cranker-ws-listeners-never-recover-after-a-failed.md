---
# accord-yo9y
title: Cranker WS listeners never recover after a failed dial — kit coalescing cache serves a cached rejection forever
status: completed
type: bug
priority: high
created_at: 2026-11-06T09:08:32Z
updated_at: 2026-11-06T09:29:40Z
---

## Symptom

`[listener]` / `[vrf-log]` / `[canon-gc]` log `WS disconnected: WebSocket failed to connect — reconnecting in 30000ms` every 30s forever. The 30s retry loop is alive but never re-dials. Only a process restart recovers.

## Root cause (kit 7.0.0 — still present in 8.6.0)

`createSolanaRpcSubscriptions` wraps the channel-pool transport in `getRpcSubscriptionsTransportWithSubscriptionCoalescing` — a per-(methodName, params) cache. The cache entry is only evicted when the established data publisher emits "error" or when all subscribers abort. If the **initial dial fails** (transient WS outage), `transport()` rejects; the `.then()` that would attach the error listener never runs, `.catch(() => {})` swallows the rejection, and the **rejected promise stays cached forever**. Every retry with identical (methodName, params) — exactly what the listeners do — is served the cached rejection instantly. No socket is ever dialed again. Restart = empty cache = instant recovery.

## Acceptance

- [ ] Repro: real kit client vs a WS endpoint that is down-then-up — second subscribe with identical params never dials; fresh client connects immediately
- [ ] Fix: listeners build a fresh subscriptions client per attempt (factory), so a poisoned client is never reused
- [ ] Regression test: listener recovers when the endpoint comes back mid-run (real kit + local fake WS server)
- [x] `bun test`, lint, build green in apps/cranker

## Summary of Changes

- Repro (throwaway, deleted): real kit client + fake WS endpoint down→up. Same client retry = instant cached rejection, 0 connections dialed; fresh client = immediate subscribe. Bug present in kit 7.0.0 AND 8.6.0 (diffed the coalescing transport — identical `.catch(() => {})` swallow, cache entry never evicted on dial rejection).
- Fix: `ProgramAccountListener`/`VrfLogListener` take `createRpcSubscriptions: () => RpcSubscriptions<...>` and build a fresh client per connection attempt (`subscribeOnce`); `index.ts` wires `createListenerRpcSubscriptions` for all three listeners. The send path intentionally keeps one shared client — signature-subscription hashes are unique per tx, so poison never outlives that tx's retries (worst case: one crank action delayed to the next 60s poll).
- Tests (`tests/listener.test.ts`): factory-per-attempt contract for both classes (mock, event-gated, no wall-clock timers) + real-kit regression test (Bun.serve fake endpoint refuses then serves; listener recovers).
- Verification: `bun test` 115 pass / 0 fail; `lint` clean; `build` (tsc --noEmit) clean.
- Follow-up candidates (NOT done here): `apps/evidence-daemon/src/chain/events.ts` and `apps/jurat/src/chain/events.ts` hold long-lived kit subscription clients with the same wedge exposure.
