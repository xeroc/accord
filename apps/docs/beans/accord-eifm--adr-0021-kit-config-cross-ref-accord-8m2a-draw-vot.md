---
# accord-eifm
title: ADR-0021 + kit-config cross-ref (accord-8m2a) + draw-voting/integration docs
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T22:10:00Z
parent: accord-z8jp
blocked_by:
  - accord-5yh0
---

assigned: implementer. ADR-0021 already drafted; finalize. Note ADR-0019 kit surface extension (cross-ref accord-8m2a for struct coordination). Update SPEC state-machine, integration/draw-voting.md, trust-profile.md (veto-by-abstention pricing), AGENTS.md v1 defaults table.

## Summary of Changes

Docs-only: wire ADR-0021 (reveal quorum + shortfall redraw) into the protocol
narrative across the integration/security/spec/agents surfaces. ADR-0021 itself
was already complete + Accepted in the index (forward-refs ADR-0019's kit surface,
which is the correct newer→older direction; no back-ref needed). ADR-0019↔8m2a
struct-field coordination was handled in the implementation (accord-5yh0) — the
new config fields coexist with 8m2a's `aggregation`/`initial_num_jurors`.

### `programs/accord/SPEC.md`

- Instructions table: `finalize_round` now notes the reveal-quorum gate (→
  `RoundResolved` on quorum / `RedrawEligible` on shortfall); added the
  `redraw` instruction row (slash no-shows → `stake_delta`, bump `draw_attempt`
  orthogonal to `round_idx`, → `Created`; exhaustion → `Failed` + filer refund).
- State-machine diagram: added the `RedrawEligible → redraw → Created/Failed`
  branch + the `draw_attempt` seed note.
- Account table: `Subaccord` +`reveal_threshold_bps`/`shortfall_policy`/
  `max_draw_attempts`; `Round` +`draw_attempt`.
- Economics: fee credit now described as quorum-gated; removed ADR-0021 from the
  out-of-scope list (now in scope).

### `apps/docs/docs/integration/draw-voting.md`

- Step table: `finalize_round` next-state splits (quorum/shortfall); added the
  `redraw` step.
- Sortition seed formula now includes `draw_attempt`.
- New "Reveal quorum + shortfall redraw (ADR-0021)" subsection (threshold gate,
  no-show slash to `stake_delta`, priced + bounded veto-by-abstention).

### `apps/docs/docs/security/trust-profile.md`

- Roadmap: the "Participation quorum / inconclusive-outcome" open gap is now
  marked resolved by ADR-0021 (priced + bounded veto-by-abstention; no-mandate
  safety over the old no-quorum liveness hedge).
- Machine-readable profile: +`reveal_threshold_bps`, +`max_draw_attempts`, +`veto_by_abstention: priced_bounded`.

### `AGENTS.md`

- v1 Defaults table: +Reveal threshold (6_666 bps), +Shortfall policy (`Redraw`),
  +Max draw attempts (3).
- Instruction sketch: +`redraw`, +`withdraw_fees`; Authority line +ADR-0021.

### `apps/docs/adr/index.md`

- Accord series range updated `0001`–`0019` → `0001`–`0021`.

### Verification

- `pre-commit` (markdownlint + all hooks): clean on every changed doc.
- Docs-only; no program/SDK/test changes.

### Notes

- ADR-0020's ADR-0002 supersession banner + 0020 docs were done by the E1 docs
  bean (b0364c8); ADR-0021 supersedes nothing (its text states this), so no
  banner annotation was needed.
- The sibling SDK config (`CreateSubaccordArgs` + `redraw` ix) is accord-he1u;
  Surfpool e2e is accord-rcem.
