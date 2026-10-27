---
# accord-2a61
title: Restructure ADRs — per-program split (apps/docs/adr/{accord,canon}/), renumber 0013/0014 collisions, repo-only (off docs site)
status: completed
type: task
priority: high
created_at: 2026-08-07T04:35:47Z
updated_at: 2026-08-07T13:28:27Z
---

Approved 2026-08-07 (Canon grilling session). Move ADRs OUT of mkdocs docs_dir to repo-only apps/docs/adr/, split per-program (accord/, canon/), fix the numbering collisions (3x0013, 3x0014 — incl. the dispute-kit ADR filed against a stale index), strip the mkdocs ADR nav (repo-only now), update README + AGENTS paths. Renumber rule: per collision group, earliest-added (git log --diff-filter=A) keeps the number; later ones overflow to next-free after 0015 (0016+). ADR content immutable; only number/path changes. Citations to renumbered ADRs updated by context. Canonicalized paths: apps/docs/adr/accord/*.md, apps/docs/adr/canon/*.md (Canon starts 0001). Execution + verification delegated to AdrRestructure agent.

## Summary of Changes (2026-08-07): Executed + verified. 19 Accord ADRs moved to apps/docs/adr/accord/ (git mv, history preserved); 0013/0014 collisions renumbered by creation-order (0013=vrf-auth, 0016=pause-scope, 0017=evidence-format, 0014=failed-state, 0018=multi-round-settlement, 0019=dispute-kit); apps/docs/adr/canon/ + hub index added; mkdocs Architecture ADR nav stripped (repo-only); README/AGENTS/SPEC/EVIDENCE-FORMAT/lib.rs/bean citations updated; old apps/docs/docs/adr/ removed. Owner accepted outcome as-is
