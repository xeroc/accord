---
# accord-6s48
title: Evaluator credibility package — README sync, on-ramp, threat model, prior-art table, coverage matrix, ADR scars
status: completed
type: feature
priority: normal
created_at: 2026-09-28T15:58:22Z
updated_at: 2026-09-28T16:12:12Z
---

Make it easy for a third-party (protocol designer, security researcher, integrator) pointed at the repo to conclude Accord is well thought out, consistent, and works as expected.

- [x] Kill README drift: Anchor 1.2.0, Synod built (not stub), suite green (not scaffolded), monorepo tree complete (packages/ui, packages/synod, apps/synod, apps/hanse, apps/pitch, reports/, runbooks/), root package.json release:* note
- [x] Evaluator on-ramp docs page: persona routing + claims→evidence table
- [x] docs/security/threat-model.md: attack→defense→test→residual ledger + invariants
- [x] docs/prior-art.md: Kleros / Aragon Court / UMA / Kourt — fact-only, cited, dated, no winners column
- [x] CI badges in README + generated instruction×test coverage matrix
- [x] ADR index superseded-by / rejected-alternative scars column
- [x] mkdocs nav wired; docs build green

## Summary of Changes

- **README de-drift**: Anchor 1.0.2→1.2.0 (5 sites), ephemeral-rollups-sdk 0.16.2→0.17.2, anchor-spl 1.2.0, sBPFv3 runtime note, 30 instructions (was 24), Synod "stub"→built+e2e-green, suite "scaffolded"→green, monorepo tree completed (packages/synod, packages/ui, apps/hanse, apps/pitch, reports/, runbooks/, formal_verification restored), root package.json note, fee comment → (min_jury_size+1)·fpj, non-reveal penalty → ADR-0021 wording, economics citations → ADR-0020/0029/0033, Synod program ID resolved (GdV5rbRd…), VRF cite → ADR-0013, example.com/TBD links → docs.useaccord.xyz, stale inline ADR list → index links, CI + docs badges added, evaluator pointer in Further Reading, anchor-litesvm "0.4.x" → xeroc fork (litesvm 0.16/agave 4.2).
- **New docs pages**: `evaluating.md` (persona routing + claims→evidence table + verify-yourself), `security/threat-model.md` (15-row attack ledger + 8 invariants, each with ADR/code/test pointers, incl. the freeze-window row from the Kourt analysis), `prior-art.md` (Accord/Kleros/UMA/Kourt, fact-only, cited, dated 2026-09-28, Aragon explicitly excluded as unciteable).
- **Generated coverage matrix**: `scripts/gen-coverage.sh` + `make coverage` → `docs/reference/coverage.md` (46 instructions × LiteSVM/host/e2e evidence, grep-derived so it cannot overclaim; honestly shows gaps e.g. `initialize_pause` unreferenced).
- **mkdocs nav**: Evaluating Accord, Prior Art, Test Coverage, Trust Profile, Threat Model wired; "Snapshot Fraud Proofs" label → "Stake Accumulator" (page documents the deletion).
- **ADR index scars**: "Superseded / amended by" column on all 35 rows; 0029/0030 statuses synced to their banners (implemented); next-number 0034→0035→(correct: last is 0035); reading path now points at 0012 as the current draw mechanism.
- **Reality-mismatch fixes**: trust-profile.md post_snapshot blockquote (deleted, not "still exposes") + Synod "specced, not yet built" → built; CONTEXT.md Coherence gloss updated for ADR-0033 (no-ruling-no-pay; was describing the superseded ADR-0029 D3 behavior).
- Verified: `make coverage` idempotent, `pre-commit run markdownlint` passes on all touched files, `mkdocs build` zero warnings, stale-string sweep clean.
- Not touched: `.github/workflows/program-tests.yml` (pre-existing user edit, pnpm 10 pin). ADR-0012/0028 status banners ("Proposed") left as-is — banner is authority; flagging that 0012 describes shipped code.
