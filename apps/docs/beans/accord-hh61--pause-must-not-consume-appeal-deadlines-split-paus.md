---
# accord-hh61
title: Pause must not consume appeal deadlines — split pause scope (CONCEPT-REVIEW Ugly 2)
status: todo
type: task
priority: high
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T15:26:11Z
parent: accord-ukqg
---

## Why

`appeal` is gated by `require!(!ctx.accounts.pause_state.paused, ProgramPaused)`
(`lib.rs:1375`), but `finalize_dispute` has **no** pause check (`lib.rs:1187-1200`).
A Squads multisig (or an attacker who compromises the threshold) can: wait for a
round to resolve, pause during the 3-day appeal window, block every appeal, let the
window expire, then finalize. That turns an operational safety switch into an
adjudicative power — it can determine which provisional rulings become final by
suppressing the procedural right to appeal. CONCEPT-REVIEW §Ugly 2 / conceptual
blocker #5.

## How (agreed)

Split-scope pause: **`appeal` and `finalize_dispute` are never pausable.** Only
`create_dispute` + `stake` are pausable. Pause then means purely "stop NEW
exposure," never an adjudicative lever. Concretely: remove the `require!(!paused)`
from `appeal` (keep it on `create_dispute` and `stake`). Update ADR-0007 to document
the split scope and the principle "pausing infrastructure must not select an
adjudicative outcome."

Alternative considered + rejected: keep pausing appeals but freeze the appeal clock
during pause AND block finalize while paused. More state, more risk; the split is
cleaner and matches the "contain new exposure" intent of ADR-0007.

## TDD acceptance

- While paused, `appeal` on an in-flight dispute SUCCEEDS.
- While paused, `create_dispute` + `stake` still revert (unchanged).
- While paused, `finalize_dispute` proceeds.
- The review's pause-authority-censors-appeal scenario is no longer reachable.

## References

CONCEPT-REVIEW §Ugly 2; ADR-0007; `lib.rs:86-135`, `lib.rs:1187-1200`,
`lib.rs:1374-1401`; bean veridao-63v3. Amends ADR-0007.
