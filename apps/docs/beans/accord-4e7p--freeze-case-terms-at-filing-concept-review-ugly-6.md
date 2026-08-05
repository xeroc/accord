---
# accord-4e7p
title: Freeze case terms at filing (CONCEPT-REVIEW Ugly 6)
status: todo
type: task
priority: high
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T15:26:11Z
parent: accord-ukqg
---

## Why

`finalize_dispute` reads **live** Subaccord params — `alpha_bps`, `min_stake`,
`fee_per_juror` (`lib.rs:1216-1218`) — and other stages read live windows/panel
sizes. A 48h-timelocked update (ADR-0005) can change slashing severity, fees, or
panel requirements mid-dispute. Disputes run ≥ 14 days (7 review + 2 commit + 2
reveal + 3 appeal), longer with appeals — easily exceeding the timelock. The
timelock protects stakers (who can unstake before a change lands) but NOT the filer,
who paid for an arbitration agreement whose economically load-bearing rules can
shift ex-post. CONCEPT-REVIEW §Ugly 6 / conceptual blocker #9.

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
- Settlement / slashing uses the FILING-TIME α, not the new one.
- Fees, panel sizes, and windows use filing-time values throughout the lifecycle.
- A second dispute filed AFTER the change uses the new values (governance still
  works for new cases).

## References

CONCEPT-REVIEW §Ugly 6; ADR-0005; `lib.rs:323-397`, `lib.rs:1216-1218`; bean
veridao-y63e. Amends ADR-0005. Foundational for Ugly 5 (settle_round) and Ugly 4
(cancel timeouts) — those tasks are blocked by this one.
