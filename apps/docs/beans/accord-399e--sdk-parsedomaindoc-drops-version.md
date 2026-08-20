---
# accord-399e
title: SDK — parseDomainDoc drops version
status: completed
type: task
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-zcjj
---

Remove `version` from ParsedDomainDoc/parseFrontmatter (packages/sdk/src/domain.ts) — content-addressed + immutable means the hash is the version. Update domain.test.ts (frontmatter parse incl. absent frontmatter). ADR-0027 format-section wording is handled by the write-path docs task; keep this change code+tests only.

TDD: adjust tests first (version no longer returned), then parser.

## Summary of Changes

- `packages/sdk/src/domain.ts`: dropped `version` from `ParsedDomainDoc` and `parseFrontmatter` (unknown keys now ignored); header doc-comment updated to state the hash IS the version.
- `packages/sdk/src/domain.test.ts` (TDD, adjusted first — RED confirmed, then GREEN): key-set assertion proves `version` absent; `version: next` test repurposed to "unknown keys ignored"; absent-frontmatter test no longer asserts `version`.
- Consumers kept green (change coupling): `apps/cli/src/commands/domain/get.ts` no longer prints a version line (description text updated); `apps/cli/test/commands/domain/domain.test.ts` asserts version absent from JSON output (fixture keeps `version: 2` to prove it's ignored).
- `.agents/skills/useaccord/references/10-domains.md`: two lines mirroring the changed CLI/SDK surface updated (no `version` key).
- Verify: SDK `pnpm lint`/`build`/`test` green (12/12 domain, 98/98 suite); CLI `pnpm lint` + `test` green (130 pass).
