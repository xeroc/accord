---
# accord-m2lm
title: Implement GREEN — CourtParams + pinned CPI mapping + errors + constants trim
status: todo
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
