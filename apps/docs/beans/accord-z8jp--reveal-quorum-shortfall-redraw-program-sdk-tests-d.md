---
# accord-z8jp
title: Reveal quorum + shortfall redraw (program + sdk + tests + docs)
status: completed
type: epic
priority: high
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T23:32:16Z
parent: accord-vsyq
blocked_by:
    - accord-edz4
---

ADR-0021 implementation. Blocked on E1 (needs `fees_earned`, `stake_delta`, threshold-gated fee credit). Covers: kit threshold/shortfall/max_draw_attempts + CaseTerms freeze; `finalize_round` threshold gate + fee credit; `redraw` crank; `draw_seat` draw_attempt seed; `max_draw_attempts→Failed`; SDK; LiteSVM; Surfpool; ADR-0021+docs. Coordinate struct field order with accord-8m2a.
