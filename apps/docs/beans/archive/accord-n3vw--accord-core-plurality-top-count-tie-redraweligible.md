---
# accord-n3vw
title: 'Accord Core: Plurality top-count tie → RedrawEligible (non-decisive round)'
status: completed
type: feature
priority: normal
created_at: 2026-08-18T02:07:04Z
updated_at: 2026-08-18T05:27:58Z
parent: accord-lqw4
---

DECIDED in PROG-MULTI-PARTY grilling session 2026-08-18 (Q-d, owner override over wrapper-side recount).

## Problem

`finalize_round` Plurality tally resolves top-count ties via `.max_by_key` → highest option index arbitrarily. With 3+ options a full-reveal odd-panel tie is STRUCTURALLY possible (5-panel: 2-2-1); with non-reveals even binary disputes can split evenly (4-of-5: 2-2). Crowning an arbitrary winner out of a dead heat is a correctness hole in Accord's own aggregation — every N-option Arbitrable inherits it (wrapper N-party program, Canon binary).

## Decision

A top-count tie (≥2 options share the max count) is a NON-DECISIVE round — identical in kind to a reveal-quorum shortfall (ADR-0021):

- tie in tally → `RedrawEligible` (same-size fresh panel via orthogonal `draw_attempt`)
- `max_draw_attempts` exhaustion → `Failed` → `cancel_dispute` refunds (ADR-0014 escape hatch)
- NO tie_policy config field — one uniform rule. Picking any option out of a tie is wrong.

## Blast radius

- `finalize_round.rs` tally branch only; reuses ADR-0021 machinery wholesale (no new state, no new instruction)
- Behavior change for ALL Plurality consumers incl. Canon: previously-arbitrary 2-2 resolutions now redraw — loud line in the ADR
- TDD: LiteSVM unit (2-2 binary via non-reveal, 2-2-1 full reveal 3-option) + Surfpool e2e
- ADR (extends ADR-0021's non-decisive family) + SPEC tally section
- Unblocks: PROG-MULTI-PARTY wrapper (meta/specs/PROG-MULTI-PARTY.md) — payout never needs tie handling after this

## Dependencies

- Deprioritize until the multi-party wrapper program moves to build; this bean exists to capture the decision before context evaporates.

- Bean ID: accord-n3vw (referenced from meta/specs/PROG-MULTI-PARTY.md Q-d + thesis).

## Summary of Changes

- `finalize_round.rs` Plurality arm: top-count tie (≥2 options share the max, including the degenerate all-zero case) → `RedrawEligible` with no result and no fee credits — identical economics to the ADR-0021 shortfall; unique max → `position(max)` replaces `.max_by_key` (no arbitrary highest-index crown). Median arm untouched.
- TDD: LiteSVM (`accumulator_litesvm.rs`) — RED observed on the pre-fix `.so`, then GREEN: 2-2 binary via non-reveal (5-panel, quorum met at 2/3), 2-2-1 full-reveal 3-option (5-panel), decisive 3-0-2 regression, and the full tie→redraw→re-vote cycle. Harness generalized (`setup_and_finalize_cfg`: panel size, option count, per-seat votes; `min_jury_size` threaded through setup with auto-fitted `max_appeals`).
- Surfpool e2e: `quorum-redraw.spec.ts` scenario 3 — split reveal (1-1 + silent seat) → `RedrawEligible` (result sentinel intact, zero credits, `fee_paid` intact) → redraw (silent seat slashed, revealers clean) → re-draw at `draw_attempt=1` → unanimous re-vote → `RoundResolved` + fees credited. Full jest suite 18/18 suites, 66/66 tests green on a private byte-verified Surfnet (deployed ELF == rebuilt `.so`).
- ADR-0026 (`apps/docs/adr/accord/0026-plurality-tie-non-decisive-redraw.md`) + index row; loud behavior-change line for all Plurality consumers incl. Canon.
- Docs reconciled to code: SPEC.md (instruction row 10, state-machine diagram + odd-panel claim, fee-credit note, edge cases, references), README.md tie paragraph, docs-site (`draw-voting.md`, `reference/instructions.md`, `reference/state-machine.md`, `security/trust-profile.md`), lib.rs instruction doc, constants.rs `MAX_JURORS` comment, `.agents/skills/useaccord/references/06-voting.md`.
- No IDL/codegen delta (no accounts/args/errors/events changed; only doc text) — `make codegen` output byte-identical; SDK/CLI/cranker untouched. Verifications: full LiteSVM suite green, jest e2e green, `pnpm -r run lint` green, `cargo clippy` clean, `cargo fmt` applied.
