---
# accord-lbst
title: Daemon — chain-anchored PUT gate (?subaccord, 1000 ms poll)
status: todo
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:36:05Z
parent: accord-5p9j
---

apps/evidence-daemon server/domain.ts: PUT requires ?subaccord=<addr>. Resolve via chain/reader seam (fetchSubaccordMaybe), polling up to 1000 ms for commitment lag; then require domain_ref == hash. Missing after poll → 404 (anchor not found); mismatch → 400. Existing semantics preserved (hash mismatch → 400, cap → 413, idempotent 200, collision 409). GET untouched. Update daemon SPEC domain section (chain-gated PUT, create-first ordering).

TDD: route tests with injected fetcher seam: anchor-appears-after-delay → accepted; never → 404; wrong domain_ref → 400; no param → 400.
