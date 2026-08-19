---
# accord-399e
title: SDK — parseDomainDoc drops version
status: todo
type: task
created_at: 2026-08-19T20:35:23Z
updated_at: 2026-08-19T20:35:23Z
parent: accord-zcjj
---

Remove `version` from ParsedDomainDoc/parseFrontmatter (packages/sdk/src/domain.ts) — content-addressed + immutable means the hash is the version. Update domain.test.ts (frontmatter parse incl. absent frontmatter). ADR-0027 format-section wording is handled by the write-path docs task; keep this change code+tests only.

TDD: adjust tests first (version no longer returned), then parser.
