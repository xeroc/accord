---
# accord-frx8
title: Review — program diff vs design + ADR canon/0002
status: completed
type: task
tags:
    - reviewer
created_at: 2026-08-19T18:18:13Z
updated_at: 2026-08-19T18:18:13Z
parent: accord-n9wi
blocked_by:
    - accord-m2lm
---

## Review verdict: PASS — no findings

Diff reviewed: `fb43f16` (RED tests) + `4b33958` (GREEN), against the milestone HANDOFF §2 data contract.

- `CourtParams`: 12 fields, exact names/types/order from HANDOFF; grouped-args derives mirror `CreateSubaccordParams`.
- Signature: `create_list(..., evidence_operator, court)` — `evidence_operator` stays its own arg (decision #3). `#[instruction]` seed anchor unaffected (`court` trails `rules_hash`).
- Guards: exactly the three canon-side ones (`AlphaTooHigh` ≤ 10_000, `WindowTooShort` nonzero review/commit/reveal, `TreeDepthTooDeep` ≤ `MAX_LIST_TREE_DEPTH = 8`); nothing duplicated from Accord's CPI validation (LiteSVM tests prove `EvenJurySize` + `LadderExceedsMaxJurors` propagate).
- Pins: `aggregation=Plurality`, `shortfall_policy=Redraw`, `coherence_tol_bps=0`, `authority=list_pda`, default attestation pair — set in the handler, absent from `CourtParams`; not input-filtered.
- Constants aftermath: 11 court `DEFAULT_*` + dead `INITIAL_NUM_JURORS` deleted; `MAX_LIST_TREE_DEPTH: u8 = 8` added; `SEED_*`/`OPTION_*`/`MAX_CHALLENGE_PCT_BPS` kept. `grep DEFAULT_TREE_DEPTH|INITIAL_NUM_JURORS programs/canon` clean.
- `CanonList` layout unchanged; no account resize/migration.
- `make test_unit` green workspace-wide (23 binaries, 0 failed), incl. all 13 `create_list_litesvm` tests (8 new contract + 5 migrated).

## Summary of Changes (docs shipped with this review)

- `apps/docs/adr/canon/0002-per-list-court-params-at-create-list.md` — new ADR: supersedes canon/0001's dispute-parameter-ownership decision; considered options (profile ownership, pinned set, guard set with rationale), consequences (SDK default profile, set-once immutables, unchanged CanonList layout, capture-resistance reasoning).
- `apps/docs/adr/canon/0001-*.md` — the superseded decision bullet carries a forward pointer to 0002; index lists 0001 as "Partially superseded".
- `apps/docs/adr/canon/index.md` — 0002 row (Accepted) + reading note.
- `programs/canon/SPEC.md` — instruction #1 row gains `court: CourtParams` + guards + propagation note; §"v1 canonical defaults" rewritten as §"Court profile" (creator-settable vs pinned vs guards, immutability, `defaultCourtParams()` defaults table incl. `appeal_window` floor and `min_stake`/`reveal_threshold_bps`/`max_draw_attempts`/`depth` rows; list-level defaults split into their own table; stale `initial_num_jurors` row replaced by `min_jury_size`).
- Verified: no stale "canonical defaults" phrasing remains on the canon docs surface; MkDocs has no explicit ADR nav entries to update (auto-discovered).
