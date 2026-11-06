---
"@useaccord/cranker": patch
---

Cranker: the WS listeners (`[listener]`, `[vrf-log]`, `[canon-gc]`) never
recovered from a transient `WebSocket failed to connect` — they retried every
30s forever and only a process restart helped. Root cause is in `@solana/kit`
(still present in 8.6.0): a client whose initial dial fails caches the
rejected subscription promise in its subscription-coalescing cache and serves
it for the lifetime of the client — identical (methodName, params) retries
never dial again. The listeners now build a fresh subscriptions client per
connection attempt, so a poisoned client is unreachable and every retry dials
for real. A regression test drives the real kit client against a local fake
WS endpoint that is down, then up, and asserts recovery.
