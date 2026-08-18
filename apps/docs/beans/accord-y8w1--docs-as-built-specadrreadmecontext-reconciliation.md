---
# accord-y8w1
title: Docs-as-built — SPEC/ADR/README/CONTEXT reconciliation
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T05:28:56Z
parent: accord-l7k7
---

assigned: implementer
After code lands: programs/synod/SPEC.md matches reality field-for-field (docs-match-reality rule), ADR synod/0001-0002 status/consequence review (e.g. tie dependency now shipped — cross-ref the new accord ADR), README project-status + monorepo entries, CONTEXT.md Synod terms drift check, PROJECT.md specced→built wording, trust-profile note for Synod party economics. Grep the whole docs surface for stale names (placeholder ID, spec-before-code phrasing).

## Summary of Changes

Docs-as-built pass against current reality (Synod = specced stub; all synod
code beans still todo — SPEC-vs-built-code field check re-runs when they land).

- **README.md**: Project Status table now matches reality — `@useaccord/sdk`
  and `tests/` were stale "🚧 Scaffolded / facade stub only / specs in
  progress" (both shipped + green); added rows for `programs/canon` (built),
  `programs/synod` (🚧 Specced, e2e blocked on `accord-n3vw`), and the apps.
  Monorepo tree gained `packages/canon` + the actual `apps/` set (cli, cranker,
  evidence-daemon, app, canon, landing). Dropped the stale "(ADR-0010, in
  progress)" tech-stack note. Verified the README tie paragraph against
  `finalize_round.rs` (`.max_by_key` → last-max = highest index): accurate, kept.
- **AGENTS.md**: `apps/` layout line listed "(web/landing/docs) — land per
  build phase" though all apps had landed; now enumerates them.
- **programs/synod/SPEC.md**: "Program ID below is the scaffold placeholder"
  pointed at nothing — now points at `declare_id!` in `src/lib.rs` + `Anchor.toml`.
- **CONTEXT.md**: Neutral Option tie clause asserted unshipped behavior ("a tie
  never resolves — it redraws"); now states the dependency honestly — until
  `accord-n3vw` lands, a Plurality tie crowns the highest option index.
- **trust-profile.md**: Synod party-economics note (marked specced, not yet
  built): escrowed `N·S` is self-enforced on-chain, so a captured panel walks
  with the pot — price the whole escrow against the security-value ceiling;
  party==juror overlap accepted, pull-only idempotent payouts, deadline refunds,
  fee frozen at open. Cross-refs ADRs synod/0001-0002.
- **Verified clean**: grep for "in progress / facade stub / Program ID below"
  across README/CONTEXT/PROJECT/AGENTS/SPEC/docs-site returns nothing; ADR
  synod index + statuses (Accepted, "specified, not built") and PROJECT.md
  "(specced)" wording verified accurate as-is; `make lint` green workspace-wide.
