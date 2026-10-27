---
# accord-q5ng
title: Synod boilerplate — ADRs + README/AGENTS/CONTEXT/PROJECT wiring
status: completed
type: task
priority: normal
created_at: 2026-08-18T05:08:39Z
updated_at: 2026-08-18T05:19:00Z
---

Post-grilling boilerplate for the Synod scaffold (session 2026-08-18): ADR series under apps/docs/adr/synod/ (0001 architecture, 0002 economics + index), ADR hub index update (+ fix stale Canon 'no ADRs' line), README.md (monorepo layout incl. missing canon entry, canonical-ID placeholder note), AGENTS.md (layout, change-coupling row, gotcha), CONTEXT.md (Synod glossary section), PROJECT.md (explain Synod AND Canon as the first real Arbitrables).

- [x] synod ADR 0001 + 0002 + index
- [x] ADR hub index updated
- [x] README.md updated
- [x] AGENTS.md updated
- [x] CONTEXT.md updated
- [x] PROJECT.md updated (Synod + Canon)
- [x] lint/docs checks pass

## Summary of Changes

- apps/docs/adr/synod/: 0001 (N-party escrow Arbitrable — supersedes the on-Accord s72c direction), 0002 (one-mint fee-from-stake economics), index.
- ADR hub: Synod series added; stale Canon "no ADRs" line fixed.
- README: monorepo layout gains canon + synod (canon was missing entirely); docs subtree corrected (ADRs are repo-only, not MkDocs content); canonical-ID bullet flags synod placeholder; tie sentence corrected (full-reveal ties only impossible in binary); per-program ADR indexes in Further Reading. Repaired an Account & PDA Model heading my own earlier edit ate (caught by markdownlint MD051).
- AGENTS.md: layout (canon+synod), packages/canon entry, change-coupling Program row, Synod section, Build Order now lists Arbitrables as step 2.
- CONTEXT.md: new Synod Context glossary (Synod, Case, Party, Roster, Join Window, Stake S, Pot, Neutral Option, Filing) with Avoid lists.
- PROJECT.md: Canon (built) + Synod (specced) explained as the two real Arbitrables under "what gets built on top".
- Verified: pre-commit all-green on every touched markdown file; cargo check -p synod clean.
