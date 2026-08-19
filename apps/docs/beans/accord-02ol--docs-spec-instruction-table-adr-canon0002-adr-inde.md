---
# accord-02ol
title: Docs — SPEC instruction table + ADR canon/0002 + adr index
status: todo
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
