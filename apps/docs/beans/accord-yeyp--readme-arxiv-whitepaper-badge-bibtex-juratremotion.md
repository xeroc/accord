---
# accord-yeyp
title: 'README: arXiv whitepaper badge + BibTeX + jurat/remotion drift sync'
status: completed
type: task
priority: normal
created_at: 2026-10-18T09:11:52Z
updated_at: 2026-10-18T09:17:01Z
---

- Add arXiv 2610.20666 badge (whitepaper, published 2026-10-14) to badge row + npm badge
- Add Citation section w/ BibTeX near bottom (Further Reading)
- Sync drift: apps/jurat + apps/remotion in layout & status table, ADR counts 36/4/2, remove phantom make run_surfpool/test_surfpool targets (not in Makefile)

## Summary of Changes

Found whitepaper via arXiv API: **arXiv:2610.20666** — 'Accord: Schelling-Point Arbitration as a Composable Solana Primitive', Fabian Schuh, 2026-10-14, cs.GT (13 pages).

README.md changes:
- Badge row: added arXiv whitepaper badge (shields b31b1b, arxiv logo) + npm version badge for @useaccord/sdk (verified published, 0.5.2)
- Further Reading: whitepaper entry + new ### Citation section with canonical arXiv BibTeX (@misc{schuh2026accord, eprint 2610.20666, primaryClass cs.GT})
- Drift sync (readme-skill pass): apps/jurat (agentic juror daemon, ADR-0036) + apps/remotion added to monorepo layout; jurat row in Project Status; ADR counts 35/3+/2 → 36/4/2; phantom 'make run_surfpool'/'make test_surfpool' targets (not in Makefile) replaced with real commands (surfpool start --yes --db :memory: / pnpm --filter @useaccord/tests test) in 3 places (commands table, Testing, Troubleshooting)

Verified: markdownlint clean under repo pre-commit rules (MD013/033/041/046/040 disabled); no remaining 'run_surfpool'/'35 accord' refs.
