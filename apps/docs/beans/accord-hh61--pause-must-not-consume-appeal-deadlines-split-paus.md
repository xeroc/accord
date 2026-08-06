---
# accord-hh61
title: Pause must not consume appeal deadlines — split pause scope (CONCEPT-REVIEW Ugly 2)
status: completed
type: task
priority: high
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T16:40:00Z
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
`lib.rs:1374-1401`; bean veridao-63v3. Amends ADR-0007 (via new ADR-0013, per
the repo's immutable-ADR convention).

## Summary of Changes

**Code (`programs/accord/src/lib.rs`):**

- Removed `require!(!pause_state.paused, ProgramPaused)` from `appeal`. Only
  `create_dispute` and `stake` remain pausable (new exposure). `finalize_dispute`
  already had no pause gate; it stays that way. `unstake` was already never
  paused — the split makes that the rule for the whole adjudication path.
- Updated the circuit-breaker module comment + the `appeal` doc comment to state
  the split scope and the principle "pausing must not select an adjudicative
  outcome."
- `pause_state` is retained in the `Appeal` accounts struct for IDL/SDK
  stability but is no longer consulted; flagged with a `ponytail:` comment for
  removal in a coordinated IDL revision (pair with `accord-r6ti`).

**Tests (`programs/accord/tests/appeal_litesvm.rs`):**

- `appeal_succeeds_while_paused` — pauses mid-dispute inside the appeal window,
  asserts `appeal` succeeds (would revert before this change ⇒ RED→GREEN).
- `finalize_dispute_proceeds_while_paused` — pauses after the appeal window
  closes, asserts `finalize_dispute` lands the dispute in `Final`.
- The "create_dispute + stake still revert while paused" criterion is already
  covered by `create_dispute_litesvm.rs` and `stake_litesvm.rs` (unchanged).
- Fixed one stale pre-existing assertion in `flip_returns_bond_to_appellant`
  (`final_ruling, Some(1)` → `final_ruling, 1`) to unblock compilation after
  `final_ruling` became `u8`. Note: the same `final_ruling` Option→u8 migration
  leaves stale `None`/`Some(0)` assertions in `create_dispute_litesvm.rs` and
  `voting_litesvm.rs` — those belong to `accord-r6ti` (settlement, which owns
  the type change and its unset-sentinel decision) and are out of scope here.

**Docs:**

- New ADR-0013 (Accepted) documents the split-scope decision + the rejected
  freeze-the-clock alternative. Added to the ADR index. ADR-0007 is left
  immutable per `apps/docs/docs/adr/index.md`; ADR-0013 amends it.

**Verification:** `appeal_litesvm` (10 tests) + `pause_litesvm` (4 tests) GREEN
via `cargo test --features no-entrypoint`. All acceptance criteria met; the
censors-appeal scenario is no longer reachable.
