---
# accord-m2lm
title: Implement GREEN — CourtParams + pinned CPI mapping + errors + constants trim
status: completed
type: task
tags:
    - implementer
created_at: 2026-08-19T18:18:13Z
updated_at: 2026-08-19T18:18:13Z
parent: accord-n9wi
blocked_by:
    - accord-pjj0
---

Make the RED tests pass:

- `programs/canon/src/state.rs`: `CourtParams` struct (12 fields, exact names in milestone HANDOFF §2).
- `programs/canon/src/lib.rs` + `instructions/create_list.rs`: add `court: CourtParams` arg; map to `CreateSubaccordParams` pinning `aggregation=Plurality`, `shortfall_policy=Redraw`, `coherence_tol_bps=0`, `authority=list_pda`, `juror_credential/schema=default()`, `evidence_operator` from the separate arg. Canon guards: `alpha_bps <= 10_000`, nonzero review/commit/reveal windows, `depth <= MAX_LIST_TREE_DEPTH`.
- `programs/canon/src/errors.rs`: `AlphaTooHigh`, `WindowTooShort`, `TreeDepthTooDeep`.
- `programs/canon/src/constants.rs`: delete the court `DEFAULT_*` constants + dead `INITIAL_NUM_JURORS`; add `MAX_LIST_TREE_DEPTH: u8 = 8`.
- `make test_unit` green.

## Summary of Changes

- `state.rs`: `CourtParams` (12 creator-settable fields, grouped-args derives mirroring `CreateSubaccordParams`); doc pins the handler-fixed fields and the set-once immutables (`min_jury_size`, `depth`). Stale "canonical defaults" wording on `CanonList` doc fixed.
- `lib.rs`: `create_list` takes `court: CourtParams`; `create_list_handler` same.
- `instructions/create_list.rs`: three canon-side guards (`AlphaTooHigh` at 10_000 — Accord has no alpha check; `WindowTooShort` for zero review/commit/reveal — anti-brick for third-party deposits; `TreeDepthTooDeep` at `MAX_LIST_TREE_DEPTH`) placed before the CPI; `CreateSubaccordParams` built from `court` with `aggregation=Plurality`, `shortfall_policy=Redraw`, `coherence_tol_bps=0`, `authority=list_pda`, default attestation pair, `evidence_operator` from its own arg. All other validation delegated to Accord's `create_subaccord` (errors propagate).
- `errors.rs`: `AlphaTooHigh`, `WindowTooShort`, `TreeDepthTooDeep` appended.
- `constants.rs`: deleted the 11 court `DEFAULT_*` constants + dead `INITIAL_NUM_JURORS`; added `MAX_LIST_TREE_DEPTH: u8 = 8` with tx-size rationale; module doc rewritten (default profile now lives in the SDK's `defaultCourtParams()`).
- Tests migrated: `create_list_litesvm.rs` — `do_create_list` now delegates to `do_create_list_court` with a `canonical_court()` helper (former default values, mirrors the SDK default profile); old happy test asserts against `canonical_court()`; `challenge_item_litesvm.rs` Subaccord fixture references `accord::constants::DEFAULT_*` (fee_per_juror literal 10).
- Verified: `anchor build --ignore-keys` then `make test_unit` — all 23 test binaries green, 0 failures, incl. all 13 `create_list_litesvm` tests (5 migrated + 8 new). `grep -rn "DEFAULT_TREE_DEPTH\|INITIAL_NUM_JURORS" programs/canon` clean.
