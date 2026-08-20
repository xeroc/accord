---
# accord-49b3
title: Daemon routes — PUT/GET /domains/{hash} + handler tests
status: completed
type: task
tags:
    - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-19T00:00:00Z
parent: accord-iq0j
blocked_by:
    - accord-v9v9
---

TDD. Wire routes per HANDOFF §4 pseudo-code: 400 hash mismatch / malformed hex, 413 over 1 MiB, 200 idempotent no-op, 409 collision, 404 unknown, ETag + Cache-Control immutable, default content-type text/markdown. Rate-limit like existing routes. Acceptance: HANDOFF §5 daemon bullets + §6.

## Summary of Changes

- `src/pipeline/domain.ts` — pure CAS logic: `putDomain` (hash-shape → 400; size cap → 413 BEFORE any store write; sha256(body)==hash → 400; store idempotency → 200 no-op / 201 create / 409 collision, incl. race-window `DomainConflictError` mapping) and `getDomain` (400 malformed / 404 unknown / 200 bytes+contentType). sha256 injected (wire passes the SDK digest), reuses `bytesEqual` from ingest.
- `src/server/domain.ts` — Hono routes `PUT/GET /domains/:hash`: 64-lowercase-hex regex guard (400), Content-Type passthrough with `text/markdown` default, `201 + Location` on create / bare `200` on no-op, GET serves raw bytes + stored Content-Type + `ETag: {hash}` + `Cache-Control: immutable`. Mounted in `app.ts` after evidence routes — global per-IP rate limiter + body-cap middleware cover it like every other route.
- `src/server/handlers.ts` — `DomainPutHandler`/`DomainGetHandler` types + result shapes on `ServerDeps`; `src/wire.ts` builds them from `domainStore` + `maxDomainBytes` (sha256 = `@useaccord/sdk/evidence`).
- `src/config.ts` — `EVIDENCE_MAX_DOMAIN_BYTES` (default 1 MiB) on `ServerConfig`; `src/main.ts` constructs `FsDomainStore`/`S3DomainStore` per the existing backend selection and threads both into `createServerDeps`.
- Tests (TDD, RED→GREEN): `src/server/domain.test.ts` drives `createApp` over the real pipeline + real `FsDomainStore` — §6 matrix: 201+Location, content-type round-trip + default, 200 idempotent, 409 collision (pre-seeded different bytes), 400 sha mismatch + malformed hex (PUT & GET), 413 before store write, 404 unknown, binary byte-exact round-trip. `app.test.ts`/`health.test.ts`/`tests/wire*.test.ts` gained domain stubs/in-memory store for the widened `ServerDeps`.
- SPEC: HTTP API rows for PUT/GET `/domains/{hash}`, module-layout entries, `EVIDENCE_MAX_DOMAIN_BYTES` env doc.

Verification: `bun test` 254 pass / 0 fail (was 244; +10 domain route tests); `tsc --noEmit` clean; `eslint` clean. Live smoke against a booted fs-backend daemon (real `main.ts` wiring): PUT → 201, re-PUT → 200, GET → exact bytes + `Content-Type: text/markdown; charset=utf-8` + `ETag` + `Cache-Control: immutable`, unknown → 404, sha-mismatch → 400, bad hex → 400, object lands at `domains/{hash}.json`.
