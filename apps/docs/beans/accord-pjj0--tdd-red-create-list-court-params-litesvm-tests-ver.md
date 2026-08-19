---
# accord-pjj0
title: TDD RED — create_list court-params LiteSVM tests (verbatim profile + AlphaTooHigh/WindowTooShort/TreeDepthTooDeep + CPI propagation)
status: todo
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
