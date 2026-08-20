---
# accord-02ol
title: Docs — SPEC instruction table + ADR canon/0002 + adr index
status: completed
type: task
tags:
    - implementer
created_at: 2026-08-19T18:18:14Z
updated_at: 2026-08-19T18:18:14Z
parent: accord-ph32
---

- `programs/canon/SPEC.md`: `create_list` instruction table gains `court: CourtParams`; v1 canonical-defaults section reworded (defaults now live in the SDK `defaultCourtParams()`); note `min_jury_size` + `depth` are set-once/immutable on the Subaccord.
- New `apps/docs/adr/canon/0002-per-list-court-params.md` (ADRs immutable-once-deployed — do not edit 0001; supersede its canonical-profile section by reference).
- Update `apps/docs/adr/canon/index.md`.
- Grep the docs surface for removed constant names (`DEFAULT_TREE_DEPTH` etc.) and reconcile.

## Summary of Changes (2026-08-20)

- `programs/canon/SPEC.md`: `create_list` instruction row gains `court: CourtParams` + documents the pinned CPI fields, the three canon-side guards (`AlphaTooHigh` / `WindowTooShort` / `TreeDepthTooDeep`), and CPI-error propagation. §v1 canonical defaults rewritten as §Court profile (`CourtParams`) and canonical defaults — creator-set at `create_list`, canonical profile = SDK `defaultCourtParams()`, `min_jury_size` + `depth` flagged set-once/immutable; `initial_num_jurors` row renamed `min_jury_size`; CourtParams table extended to all 12 fields; list-level economics split into their own table; §Out of scope "per-list custom dispute-param tiers" reworded (shipped as court params; only the advanced dApp UI remains out of scope); `canon-0002` added to §Authority.
- New `apps/docs/adr/canon/0002-per-list-court-params.md`: decision record (CourtParams arg, pinned fields, guard/validation split, constants→SDK `defaultCourtParams()`, set-once notes), partially supersedes canon/0001 §Dispute-parameter ownership by reference (0001 untouched — immutable once deployed).
- `apps/docs/adr/canon/index.md`: 0002 row (Accepted); 0001 status → "Partially superseded (dispute-parameter ownership, by 0002)".
- Grep reconcile: no living canon doc references the removed canon `DEFAULT_*` court constants; remaining `INITIAL_NUM_JURORS` hits are Accord-side docs (Accord's own constant — pre-existing drift from accord-9q3e, out of canon scope) and immutable bean/ADR history.
