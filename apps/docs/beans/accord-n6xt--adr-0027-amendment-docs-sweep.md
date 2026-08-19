---
# accord-n6xt
title: ADR-0027 amendment + docs sweep
status: completed
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

## Summary of Changes

- **ADR-0027 amendment appended** (`apps/docs/adr/accord/0027-…md`) — history preserved; new section supersedes rules 1/5/6 + protocol: chain-gated PUT (`?subaccord` anchor, ≤1000 ms poll, 404/400 semantics, Subaccord as universal anchor, GET ungated), create-first happy path (publish ≠ creation, loud missing state + retry), frontmatter drops `version` (hash is the version), amended protocol block, implementation-bean pointers.
- **SDK `packages/sdk/src/domain.ts`** — `ParsedDomainDoc.version` dropped; parser ignores legacy `version` keys (TDD: test first asserted non-extraction); module doc-comments updated. Convention's single home now matches the amended ADR (leaving the parser extracting `version` would have been a docs↔code divergence).
- **canon SPEC** (`programs/canon/SPEC.md` §Rules & evidence) — chain-anchored create-first prose replaces "permissionless PUT / doc-first"; frontmatter title/description; publish paragraph rewritten (create-first, loud half-state, commands without pinned flags — flag specifics live in the skill).
- **Skill** (`.agents/skills/useaccord/references/10-domains.md`) — full rewrite: chain-anchored PUT semantics (404 anchor / 400 mismatch), create-first flow, `--subaccord` REQUIRED flag + examples, `putDomainDoc` SDK mapping, frontmatter without `version`. CLI binary's `--subaccord` flag ships with accord-6kza (noted: the old examples already 400 against the amended daemon, so protocol-true docs were the least-wrong state).
- **adr index** — verified: only a range mention (`0001`–`0027`), no amendment note needed. Daemon SPEC was already swept in accord-lbst; verified no stragglers.
- Straggler grep across README/docs/SPECs/skill: clean (remaining "doc-first"/"no chain gate" hits are bean history records + the ADR's deliberately-preserved original text, explicitly superseded by the amendment).

Verify: `mkdocs build` green (8.3 s); SDK `pnpm test` + `lint` + `build` green; daemon suite re-run 260/260 green.
