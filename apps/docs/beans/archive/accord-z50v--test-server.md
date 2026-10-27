---
# accord-z50v
title: Test server
status: completed
type: task
priority: normal
created_at: 2026-08-05T14:32:36Z
updated_at: 2026-08-05T14:32:36Z
parent: accord-s3ow
blocked_by:
  - accord-dyf0
  - accord-u1pu
---

---

assigned: tester

---

Route contracts (POST/GET/healthz), rate-limit triggers, TLS, accounting key never grants access.

See milestone accord-yjno HANDOFF §6 for the shared contract (data types, crypto, edge cases, DoD).

## Summary of Changes

Replaced the implementer's smoke checks with the full server contract suite
(bean accord-z50v). Covers every HTTP-layer invariant the server owns:
route mapping, status-code reflection, rate-limit triggers, accounting-key
neutrality, body-size cap, and TLS config wiring. The server is exercised
through injected stub handlers — its job is to map handler results to HTTP,
not to do crypto.

`apps/evidence-daemon/src/server/app.test.ts` — 24 contract tests across:

- **POST /evidence/:subaccord/:dispute**: happy → 201 + Location (empty body);
  conflict → 409; bad-bundle → 400; non-JSON body → 400; malformed subaccord
  → 400; malformed dispute → 400.
- **GET /evidence/:dispute/for/:juror**: happy → 200 + delivery payload;
  not-drawn/premature → 404; integrity-gate failure → 409; malformed juror
  → 400.
- **GET /healthz**: ok → 200; degraded → 503 (LB drains) + detail.
- **Rate limit (per peer IP)**: 429 + Retry-After after the per-minute cap;
  limits isolated per IP; disabled when `rateLimitPerMin = 0`.
- **X-Account-Key (accounting only)**: succeeds with no key; succeeds with any
  key value (never gates access); observed/logged when present + enabled;
  ignored entirely when disabled (default).
- **Content-length cap**: over-cap → 413.
- **TLS config wiring**: no TLS env → plain (empty tls config); both paths set
  → populated; only one path set → still plain (both required). A live TLS
  handshake is deferred to the e2e bean (accord-xh6n).

### Verification

- `pnpm --filter @accord/evidence-daemon run lint` (tsc --noEmit): clean.
- `pnpm --filter @accord/evidence-daemon test` (bun test): **31 pass, 0 fail**
  (24 contract + 7 healthz), 60 expect() calls.

### Notes / handoffs

- The crypto-dependent §6 matrix cases (decryptable-by-juror-only, tampered-
  bundle alert, ciphertext-only storage, non-juror decrypt failure) are owned
  by the unit-crypto bean (accord-c07y) and the e2e bean (accord-xh6n). The
  server suite asserts the routing/status reflection of each handler result
  code, which is the server's actual contract.
