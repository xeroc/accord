---
# accord-uecf
title: SDK — putDomainDoc helper
status: completed
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:35:35Z
parent: accord-5p9j
---

`putDomainDoc(daemonUrl, bytes, { subaccord })` in packages/sdk/src/domain.ts: PUT {daemonUrl}/domains/{sha256Hex(bytes)}?subaccord=<addr>, Content-Type text/markdown default. Idempotent 200/201 → ok; 400/404/409/413 → typed errors carrying status + body. Single implementation — CLI and both dApps consume it.

TDD: unit tests for hash computation, param shape, ?subaccord param, status mapping before implementation.

## Summary of Changes

- `packages/sdk/src/domain.ts` — `putDomainDoc(daemonUrl, bytes, { subaccord, contentType? })`: PUTs to `/domains/{hashDomainDoc(bytes)}?subaccord=<encodeURIComponent(addr)>` (trailing-slash-safe URL, default `text/markdown`). Resolves `{ status: 200 | 201, hash }` on success (201 created / 200 idempotent no-op); throws the new `DomainPublishError` on every other status, carrying `.status` + raw `.body` (any non-2xx, not just 400/404/409/413 — transport-level rejects surface too). One `body: bytes as unknown as BodyInit` cast (base lib.dom predates generic `Uint8Array<ArrayBufferLike>`; zero-copy, commented).
- Exported from `@useaccord/sdk` root: `putDomainDoc`, `DomainPublishError`, `PutDomainDocOptions`, `PutDomainDocResult` (index.ts).
- `packages/sdk/src/domain.test.ts` — 5 new tests (written RED first): URL shape + hash + method + default content-type + byte-exact body, contentType override, 200/201 both resolve, status→DomainPublishError mapping for 400/404/409/413 with body, unparseable-body (502) still typed.
- Fallout fix: `apps/cli/src/commands/domain/get.ts` dropped its `doc.version` print (orphaned by the accord-n6xt frontmatter version-drop; CLI build was red without it).

Verify: SDK `pnpm test` 98/98 green, `lint` + `build` green; `@useaccord/cli` build + lint green.
