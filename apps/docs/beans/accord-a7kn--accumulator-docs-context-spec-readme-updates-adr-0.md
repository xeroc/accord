---
# accord-a7kn
title: 'Accumulator — docs: CONTEXT / SPEC / README updates (ADR-0012)'
status: todo
type: task
priority: normal
created_at: 2026-08-05T17:12:02Z
updated_at: 2026-08-05T17:12:02Z
parent: accord-g74z
---

## Why

The accumulator replaces the snapshot layer; user-facing docs must reflect the
new model and stop describing post/challenge/finalize, the bond, and the 1-day
window.

## Scope

- **CONTEXT.md**: update the Snapshot/Draw terms (no posted snapshot; live
  accumulator; root frozen at VRF-commit). Add an *Accumulator* term.
- **programs/accord/SPEC.md**: rewrite the snapshot/draw sections for the
  accumulator + per-seat `draw_seat`; update the account/seed tables
  (`Subaccord` +accumulator fields; `JurorStake` +`tree_index` −`last_change_slot`;
  `Dispute` +`frozen_root`; remove the `Snapshot` account + bond flows).
- **README**: update the dispute-lifecycle diagram and the snapshot-trust
  description (canonical root, no fraud window).
- Purge user-facing references to the 1-day challenge window, snapshot bond, and
  the four fraud predicates.

## Acceptance

- Docs describe the accumulator model accurately.
- No stale snapshot/fraud-window references in user-facing docs.

## References

ADR-0012; `accord-g74z`; CONTEXT.md.
