---
# accord-8m2a
title: Subaccord dispute-kit config — aggregation enum + rename jurors_per_dispute → initial_num_jurors (ADR-0019)
status: completed
type: feature
priority: high
created_at: 2026-08-06T03:47:45Z
updated_at: 2026-08-07T14:22:05Z
---

## Why

ADR-0019 (Accepted) locks two `Subaccord`-account changes that make the per-Subaccord mechanism config ("dispute kit") explicit rather than hardcoded:

1. **Add `aggregation: Aggregation` enum** (v1 single variant `Plurality`). Aggregation becomes config, not Core logic. Future IRV (`accord-ayqq`) and Median ship as new variants without touching Core or any existing dispute.
2. **Rename `jurors_per_dispute` → `initial_num_jurors`** — KEPT configurable (do NOT drop). The old name read as a fixed total jury; the new name makes clear this is the **round-1 seed** and appeals grow the panel via the existing `2N+1` rule.

Session note (2026-08-06): the field was nearly dropped (hardcode round-1 = 3); user pushed back correctly — keep it configurable, just rename for clarity.

## Scope (todos)

- [x] Add `Aggregation` enum (`Plurality` v1) to `state.rs` + `aggregation: Aggregation` field on `Subaccord`
- [x] Rename `jurors_per_dispute` → `initial_num_jurors` (`state.rs`, `lib.rs`, SDK, tests, constants)
- [x] `create_subaccord` validation: `initial_num_jurors` **odd**; ladder `initial_num_jurors · 2^max_appeals + (2^max_appeals − 1) ≤ MAX_JURORS (=31)`; reject bad combos; default 3
- [x] Confirm appeal growth stays `2N+1` per round from the seed (draw + finalize respect `initial_num_jurors`)
- [x] Docs already updated: ADR-0019, SPEC.md Subaccord row + out-of-scope, EVIDENCE-FORMAT.md §4 + §10 cross-ref, ADR index (SPEC.md Subaccord row updated to `initial_num_jurors` + `aggregation`; security-checklist §18/§29 reflects the now-implemented bounds)
- [x] SDK: expose `aggregation` + `initial_num_jurors` in `createSubaccord`
- [x] LiteSVM TDD tests: aggregation defaults to `Plurality`; `initial_num_jurors` odd + ladder-≤-MAX_JURORS validation (incl. reject e.g. initial=5/max_appeals=3); appeal panels `2N+1` from seed (3→7→15→31 at default)

## Authority

ADR-0019 · `programs/accord/SPEC.md` (Account model, Out of scope) · `state.rs` Subaccord · `apps/evidence-daemon/EVIDENCE-FORMAT.md` §4/§10 · constants (`MAX_JURORS`)

## Summary of Changes

ADR-0019 dispute-kit config landed:

- **`Aggregation` enum** (`Plurality` v1) added to `state.rs` + `aggregation: Aggregation` field on `Subaccord` and `CreateSubaccordParams`. Future IRV/Median ship as new variants without touching Core.
- **Rename `jurors_per_dispute` → `initial_num_jurors`** across `state.rs` (`Subaccord`, `CaseTerms`, `CreateSubaccordParams`), `lib.rs`, `UpdatePayload::InitialNumJurors`, `constants.rs` (`DEFAULT_INITIAL_NUM_JURORS`), the full SDK (regenerated via codama + hand-written facades `lifecycle.ts`/`dispute.ts`/`appeal.ts`/`adapter.ts`/`constants.ts`/`types.ts`), and all tests.
- **`create_subaccord` validation (ADR-0019):** `initial_num_jurors` must be **odd** (`InitialNumJurorsNotOdd`); the appeal ladder `(initial+1)·2^max_appeals − 1 ≤ MAX_JURORS` (`PanelLadderExceedsMax`). Default 3 → 3/7/15/31. SDK mirrors this in `assertValidPanelConfig`.
- **Appeal growth `2N+1` from the seed** is unchanged: `panel_size_for_round(initial_num_jurors, round_idx)` (param renamed); draw/appeal/finalize read `terms.initial_num_jurors`.
- **Docs:** SPEC.md Subaccord row updated (initial_num_jurors + aggregation); security-checklist §18/§29 now reflect the implemented bounds; ADR-0019 + index + EVIDENCE-FORMAT.md already current.
- **LiteSVM (6 new tests, `make test_unit` green):** aggregation defaults to `Plurality`; reject even/zero seed; reject ladder overflow (5/3 → 47); accept boundaries (1/3 → 15; 7/2 → 31; 31/0 → 31); stored seed verified.
- **Verification:** `anchor build` + codama codegen clean; `make test_unit` 34 accumulator + 1 health + 4 pause tests pass; SDK `pnpm test` 65 pass; SDK lint + tests `tsc --noEmit` clean.
- **Out of scope (follow-up):** the separate MkDocs site (`apps/docs/docs/`) and root `README.md` still reference the old name in a handful of integration/reference pages — separate docs surface, not enumerated in this bean.
