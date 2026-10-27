---
# accord-4e7p
title: Freeze case terms at filing (CONCEPT-REVIEW Ugly 6)
status: completed
type: task
priority: high
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T20:15:04Z
parent: accord-ukqg
---

## Why

`finalize_dispute` reads **live** Subaccord params -- `alpha_bps`, `min_stake`,
`fee_per_juror` (`lib.rs:1216-1218`) -- and other stages read live windows/panel
sizes. A 48h-timelocked update (ADR-0005) can change slashing severity, fees, or
panel requirements mid-dispute. Disputes run >= 14 days (7 review + 2 commit + 2
reveal + 3 appeal), longer with appeals -- easily exceeding the timelock. The
timelock protects stakers (who can unstake before a change lands) but NOT the filer,
who paid for an arbitration agreement whose economically load-bearing rules can
shift ex-post. CONCEPT-REVIEW Ugly 6 / conceptual blocker #9.

## How (agreed)

At `create_dispute`, snapshot the economics-relevant params into the `Dispute` (or a
small `CaseTerms` account): `alpha_bps`, `min_stake`, `fee_per_juror`,
`jurors_per_dispute`, `review_window`, `commit_window`, `reveal_window`,
`max_appeals`. All later instructions (`draw`, `finalize_round`, `finalize_dispute`,
`appeal`, `settle_round`) read the **frozen** copy, never live `Subaccord`. ~40
bytes of state. The 48h timelock (ADR-0005) then governs only FUTURE disputes; an
active case is immune to governance changes for its entire life.

This is the arbitration-contract principle: parties cannot consent to a process
whose rules may change after the dispute is underway.

## TDD acceptance

- File a dispute; then propose + execute a timelocked `alpha_bps` change during the
  dispute.
- Settlement / slashing uses the FILING-TIME alpha, not the new one.
- Fees, panel sizes, and windows use filing-time values throughout the lifecycle.
- A second dispute filed AFTER the change uses the new values (governance still
  works for new cases).

## References

CONCEPT-REVIEW Ugly 6; ADR-0005; `lib.rs:323-397`, `lib.rs:1216-1218`; bean
veridao-y63e. Amends ADR-0005. Foundational for Ugly 5 (settle_round) and Ugly 4
(cancel timeouts) -- those tasks are blocked by this one.

## Summary of Changes

Added a `CaseTerms` struct (`state.rs`) snapshotting the 8 economics-relevant
Subaccord params (`alpha_bps`, `min_stake`, `fee_per_juror`,
`jurors_per_dispute`, `review_window`, `commit_window`, `reveal_window`,
`max_appeals`) and a `terms: CaseTerms` field on `Dispute`. `create_dispute`
now freezes these at filing time; every post-filing instruction
(`post_snapshot`, `draw`, `finalize_dispute`, `appeal`) reads `dispute.terms`,
never live `Subaccord`. A 48h-timelocked update (ADR-0005) now governs only
disputes filed after the change lands -- an active case is immune to governance
shifts for its entire life.

- `state.rs`: new `CaseTerms` (InitSpace, ~40 B) + `Dispute.terms` field.
- `lib.rs`: `create_dispute` snapshots; `post_snapshot`/`draw`/`finalize_dispute`/`appeal`
  read `dispute.terms.*` (bond sizing, panel sizing, `min_stake` gate, windows, slash
  math, fee math, `max_appeals` cap). Removed the now-dead `sub` binding in `post_snapshot`.
- `tests/case_terms_litesvm.rs` (new): 3 LiteSVM tests -- (1) snapshot equals filing-time
  values for all 8 fields; (2) a landed mid-dispute `alpha_bps` change mutates the live
  Subaccord but NOT the active dispute's terms; (3) a second dispute filed after the change
  snapshots the NEW value.
- Fixed pre-existing `final_ruling: Option<u8>` -> `u8` (u8::MAX sentinel) drift in
  `tests/state.rs`, `create_dispute_litesvm.rs`, `voting_litesvm.rs`,
  `appeal_litesvm.rs` so the full `make test_unit` harness compiles green (these were
  broken before this bean; the sentinel migration in `state.rs` had not been propagated
  to the test assertions).

Verification: `make test_unit` -- all 14 test binaries green (91 tests, 0 failed),
including the 3 new case-terms tests.
