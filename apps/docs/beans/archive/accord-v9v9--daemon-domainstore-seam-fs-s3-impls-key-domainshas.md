---
# accord-v9v9
title: Daemon DomainStore seam — fs + s3 impls, key domains/{hash}
status: completed
type: task
tags:
    - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-19T00:00:00Z
parent: accord-iq0j
---

TDD. DomainStore trait mirroring EvidenceStore (apps/evidence-daemon/src/store/), key domains/{hash}, content-type stored + round-trips on both backends. Acceptance: HANDOFF §5 content-type round-trip bullet. No parsing — bytes in, bytes out.

## Summary of Changes

- `src/store/domain.ts` — `DomainStore` trait (`put`/`get`/`exists`, NO delete — retention forever), `DomainObject` (hash/bytes/contentType), `DomainConflictError` (different bytes at same hash ⇒ 409 alarm), `assertDomainHash` (64-lowercase-hex guard, load-bearing against fs path traversal), `DEFAULT_DOMAIN_CONTENT_TYPE = "text/markdown"` for the routes bean.
- `src/store/domain-s3.ts` — `S3DomainStore`: key `domains/{hash}`, raw bytes body, S3-native `ContentType` metadata (round-trips), GET-first idempotency with byte comparison, optional SSE (reuses `S3StoreConfig` + evidence bucket).
- `src/store/domain-fs.ts` — `FsDomainStore`: `{rootDir}/domains/{hash}.json` JSON envelope `{v, content_type, bytes}` so one file carries bytes + content-type (round-trips), read-first idempotency, foreign file ⇒ conflict.
- Tests (TDD, RED→GREEN): `domain-fs.test.ts` + `domain-s3.test.ts` — content-type round-trip incl. non-default + params (acceptance bullet), format-blindness (full byte range incl. invalid UTF-8), idempotent no-op (fs: file untouched; s3: no second PutObject), 409 on different bytes, foreign-object conflict, hash validation, exists, `domains/` key-prefix layout.
- `SPEC.md`: added "Domain CAS namespace (storage seam — ADR-0027)" data-model subsection + module-layout entries describing the shipped seam (storage half only; HTTP surface + invariant re-scope stay with accord-49b3 / accord-cqlp).

Verification: `bun test` 244 pass / 0 fail (was 217; +27 domain tests), `pnpm run build` (tsc --noEmit) clean, `pnpm run lint` (eslint+prettier) clean.
