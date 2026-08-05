---
# accord-18fb
title: General escape path — Failed state + cancel_dispute with stage timeouts (CONCEPT-REVIEW Ugly 4)
status: todo
type: task
priority: high
created_at: 2026-08-05T15:25:46Z
updated_at: 2026-08-05T15:26:11Z
parent: accord-ukqg
blocked_by:
    - accord-4e7p
---

## Why

`DisputeState` (`state.rs:231-242`) has no `Failed`/`Cancelled` terminal state, and
no instruction offers a timeout-based cancellation or refund. The process can stall
at many points — no snapshot posted, snapshot voided with no repost, the VRF oracle
never calls back, a round never finalizes, no cranker advances state — and in every
case the protocol custodies the filer's fee indefinitely without delivering a
ruling. Liveness failure is not a first-class state. CONCEPT-REVIEW §Ugly 4 /
conceptual blocker #7.

## How (agreed)

1. Add `DisputeState::Failed` (terminal).
2. Add a permissionless `cancel_dispute` crank gated on **per-stage timeouts**
   declared at filing (these live in the frozen case terms — see the frozen-terms
   task):
   - no snapshot within X days of `create_dispute`;
   - voided snapshot + no repost within Y days;
   - no `committed_vrf` within Z days;
   - a round never reaches finalizable within W days.
3. On cancel: refund the filer's fee from the vault; walk every existing round and
   release its jurors' `active_draws`; return poster/appellant bonds to their
   owners as applicable; transition to `Failed`.
4. `Failed` is terminal — no further transitions.

A generic `Failed` outcome is preferable to indefinite custody. For applications
where "no ruling" is unacceptable, the fallback court must be precommitted in the
original case terms (out of scope here — application responsibility).

## TDD acceptance

- Dispute with no snapshot past its timeout → `cancel_dispute` succeeds, filer fee
  refunded.
- Voided snapshot + no repost past timeout → cancel.
- Round never finalized past timeout → cancel + that round's `active_draws`
  released.
- Cancel BEFORE the relevant timeout reverts.
- `Failed` is terminal: no lifecycle instruction accepts it.

## References

CONCEPT-REVIEW §Ugly 4; `state.rs:229-242`. Requires a new ADR. Blocked by the
frozen-case-terms task (stage timeouts live there). Pairs with the repost task to
close the snapshot-fraud recovery loop.
