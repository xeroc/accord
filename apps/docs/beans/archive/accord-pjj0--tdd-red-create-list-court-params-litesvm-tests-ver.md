---
# accord-pjj0
title: TDD RED — create_list court-params LiteSVM tests (verbatim profile + AlphaTooHigh/WindowTooShort/TreeDepthTooDeep + CPI propagation)
status: completed
type: task
tags:
    - tester
created_at: 2026-08-19T18:18:13Z
updated_at: 2026-08-19T18:18:13Z
parent: accord-n9wi
---

Write the failing tests FIRST in `programs/canon/tests/` (LiteSVM, `--features no-entrypoint`, safe-solana-builder litesvm.md checklist):

- Happy: `create_list` with a custom `CourtParams` → every field lands verbatim on the backing Subaccord (fetch + field-compare); `aggregation` is Plurality, `authority` is the CanonList PDA, `coherence_tol_bps` is 0, credentials default.
- `alpha_bps = 10_001` → `AlphaTooHigh`.
- review/commit/reveal window = 0 (each) → `WindowTooShort`.
- `depth = 9` → `TreeDepthTooDeep`.
- Even `min_jury_size` → Accord `EvenJurySize` propagates through the CPI.
- Ladder overflow (`min_jury_size = 9, max_appeals = 3`) → Accord `LadderExceedsMaxJurors` propagates.

See milestone HANDOFF for the full contract. RED must fail for the right reason (compile error on missing struct/signature counts).

## Summary of Changes

Added 8 failing LiteSVM tests to `programs/canon/tests/create_list_litesvm.rs` (additive — existing tests untouched):

- `create_list_custom_court_params_land_verbatim` — custom profile (every value ≠ canonical default) lands verbatim on the backing Subaccord; pins `aggregation=Plurality`, `shortfall_policy=Redraw`, `coherence_tol_bps=0`, `authority=CanonList PDA`, default attestation pair, `evidence_operator` from the separate arg.
- `create_list_alpha_bps_above_cap_fails` (`10_001` → `AlphaTooHigh`), three zero-window tests (`review`/`commit`/`reveal` = 0 → `WindowTooShort`), `create_list_depth_above_cap_fails` (`MAX_LIST_TREE_DEPTH + 1` = 9 → `TreeDepthTooDeep`).
- `create_list_even_jury_size_propagates_from_accord` (`min_jury_size=4` → `EvenJurySize`), `create_list_ladder_overflow_propagates_from_accord` (`9`/`3` → ladder top 79 > 31 → `LadderExceedsMaxJurors`) — both assert the Accord error name via `r.has_log`, proving CPI propagation.

Helpers: `court_params()` (non-canonical profile) + `do_create_list_court()` (temporary duplicate of `do_create_list` with the `court` arg; GREEN collapses them).

RED verified: `cargo test -p canon --features canon/no-entrypoint --no-run` fails with exactly the three contract errors — E0432 `canon::state::CourtParams` unresolved, E0560 `CreateList` has no field `court`, E0425 `MAX_LIST_TREE_DEPTH` not found. No other failure mode.
