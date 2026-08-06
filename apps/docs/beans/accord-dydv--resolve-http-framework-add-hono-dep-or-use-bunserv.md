---
# accord-dydv
title: "Resolve HTTP framework: add Hono dep or use Bun.serve"
status: todo
type: task
priority: high
created_at: 2026-08-06T20:29:33Z
updated_at: 2026-08-06T20:29:33Z
parent: accord-s3ow
blocking:
  - accord-dyf0
---

---

assigned: implementer

---

## Decision gate (blocks accord-dyf0 — server impl)

SPEC §Module layout + §HTTP API mandate **"Bun + Hono"**, but `apps/evidence-daemon/package.json` has **no `hono` dependency**. An implementer of `src/server/{app,routes}.ts` (accord-dyf0) will hit this immediately. Resolve first.

The v1 API surface is three routes:

- `POST /evidence/{subaccord}/{dispute}`
- `GET /evidence/{dispute}/for/{juror}`
- `GET /healthz`

Plus: per-IP rate limit, TLS, optional `X-Account-Key` (accounting only).

## Options

| Option                 | Deps added                       | Effort                                                                               | When                                                    |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Bun.serve (native)** | 0                                | ~30 lines: a router switch on `method + pathname`, `Bun.serve({ tls, port, fetch })` | v1 KISS — 3 routes, no middleware chain needed          |
| **Hono**               | `hono` (+ `@hono/rate-limiter`?) | Smaller route handlers, middleware ergonomics                                        | If routing/rate-limit middleware genuinely reduces code |

**Ponytail lean: `Bun.serve`.** Three routes don't justify a framework dep. Rate limiting is a `Map<ip, count>` sliding window in 10 lines. TLS is a `Bun.serve` option. Adding Hono pulls a dep for ergonomic routing that 3 routes don't need — and the SPEC's "Bun + Hono" was written before checking the dep was absent. If you reach for Hono, justify it against the native alternative.

## DoD

- [ ] Decision recorded (append to `apps/evidence-daemon/SPEC.md` §Module layout if it changes — SPEC is intent authority).
- [ ] If Hono: `bun add hono`, add to `package.json` deps.
- [ ] If Bun.serve: update SPEC wording from "Bun + Hono" to "Bun.serve (native)".
- [ ] Unblocks accord-dyf0.

This is a pre-implementation gate, not a full server build — that's accord-dyf0.
