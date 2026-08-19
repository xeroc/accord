---
# accord-n6xt
title: ADR-0027 amendment + docs sweep
status: todo
type: task
priority: normal
created_at: 2026-08-19T20:35:24Z
updated_at: 2026-08-19T20:36:05Z
parent: accord-5p9j
blocked_by:
    - accord-lbst
---

Amend ADR-0027 (append amendment section — do not rewrite history): PUT is chain-gated (?subaccord anchor, ≤1000 ms poll) superseding "no chain reads in the domain namespace"; happy path is create-first (publish after tx confirm), superseding doc-first; recommended frontmatter drops `version` (title/description). Sweep: daemon SPEC (if not already in gate task), canon SPEC rules section, apps/docs adr index, .agents/skills cross-check, CLI help text. grep -rn "domain" across docs surface to catch stragglers.

Verify: mkdocs build green; no stale doc mentions of version key / doc-first flow.
