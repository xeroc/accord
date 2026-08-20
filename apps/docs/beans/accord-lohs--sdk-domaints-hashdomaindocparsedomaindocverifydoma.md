---
# accord-lohs
title: SDK domain.ts — hashDomainDoc/parseDomainDoc/verifyDomainDoc/fetchDomainDoc + unit tests
status: completed
type: task
tags:
    - implementer
created_at: 2026-08-18T23:00:04Z
updated_at: 2026-08-18T23:00:04Z
parent: accord-a6yc
---

TDD. Implement packages/sdk/src/domain.ts per milestone accord-lgof HANDOFF §2 (exact signatures). Frontmatter parser: zero deps. Acceptance: HANDOFF §5 SDK bullet + §8 parse/verify rows. Export from @useaccord/sdk root.

## Summary of Changes

- `packages/sdk/src/domain.ts` — the domain-document convention's single home (ADR-0027, milestone accord-lgof): `hashDomainDoc` (noble sha256 → lowercase 64-hex), `parseDomainDoc` (zero-dep `---` frontmatter parser: title/description/version, quoted values unquoted, absent/unterminated frontmatter ⇒ body-only), `verifyDomainDoc` (32-byte or 64-hex ref, case-insensitive hex), `fetchDomainDoc` (GET `/domains/{hash}` → sha256 verify → parse; throws on non-200 and tampered bytes).
- `packages/sdk/src/domain.test.ts` — 12 node:test cases: RFC 6234 hash vector, determinism, frontmatter present/absent/unterminated/quoted/non-numeric-version/empty, verify (byte-ref + string-ref, mismatch + wrong-length), fetch happy/tamper/404 (stubbed fetch).
- `packages/sdk/src/index.ts` — re-export the four functions + `ParsedDomainDoc`/`FetchedDomainDoc` from the `@useaccord/sdk` root.

Verification: `pnpm --filter @useaccord/sdk test` 98/98 green (12 new); `pnpm -r run build` + `pnpm -r run lint` green workspace-wide.
