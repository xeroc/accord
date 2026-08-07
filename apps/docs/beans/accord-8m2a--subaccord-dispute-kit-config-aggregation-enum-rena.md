---
# accord-8m2a
title: Subaccord dispute-kit config — aggregation enum + rename jurors_per_dispute → initial_num_jurors (ADR-0019)
status: todo
type: feature
priority: high
created_at: 2026-08-06T03:47:45Z
updated_at: 2026-08-06T03:47:45Z
---

## Why

ADR-0019 (Accepted) locks two `Subaccord`-account changes that make the per-Subaccord mechanism config ("dispute kit") explicit rather than hardcoded:

1. **Add `aggregation: Aggregation` enum** (v1 single variant `Plurality`). Aggregation becomes config, not Core logic. Future IRV (`accord-ayqq`) and Median ship as new variants without touching Core or any existing dispute.
2. **Rename `jurors_per_dispute` → `initial_num_jurors`** — KEPT configurable (do NOT drop). The old name read as a fixed total jury; the new name makes clear this is the **round-1 seed** and appeals grow the panel via the existing `2N+1` rule.

Session note (2026-08-06): the field was nearly dropped (hardcode round-1 = 3); user pushed back correctly — keep it configurable, just rename for clarity.

## Scope (todos)

- [ ] Add `Aggregation` enum (`Plurality` v1) to `state.rs` + `aggregation: Aggregation` field on `Subaccord`
- [ ] Rename `jurors_per_dispute` → `initial_num_jurors` (`state.rs`, `lib.rs`, SDK, tests, constants)
- [ ] `create_subaccord` validation: `initial_num_jurors` **odd**; ladder `initial_num_jurors · 2^max_appeals + (2^max_appeals − 1) ≤ MAX_JURORS (=31)`; reject bad combos; default 3
- [ ] Confirm appeal growth stays `2N+1` per round from the seed (draw + finalize respect `initial_num_jurors`)
- [ ] Docs already updated: ADR-0019, SPEC.md Subaccord row + out-of-scope, EVIDENCE-FORMAT.md §4 + §10 cross-ref, ADR index
- [ ] SDK: expose `aggregation` + `initial_num_jurors` in `createSubaccord`
- [ ] LiteSVM TDD tests: aggregation defaults to `Plurality`; `initial_num_jurors` odd + ladder-≤-MAX_JURORS validation (incl. reject e.g. initial=5/max_appeals=3); appeal panels `2N+1` from seed (3→7→15→31 at default)

## Authority

ADR-0019 · `programs/accord/SPEC.md` (Account model, Out of scope) · `state.rs` Subaccord · `apps/evidence-daemon/EVIDENCE-FORMAT.md` §4/§10 · constants (`MAX_JURORS`)
