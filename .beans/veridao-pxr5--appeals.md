---
# veridao-pxr5
title: Appeals
status: completed
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-04T05:18:59Z
parent: veridao-rlno
blocked_by:
  - veridao-pq1s
---

Permissionless escalation to a larger panel.

## Tasks

- [x] appeal(dispute) — permissionless; pay N_new\*fee_per_juror + bond; open new round at 2N+1; max 3 appeals; bond forfeited to coherent jurors of final round if no flip, returned if flip

## Acceptance (TDD)

2N+1 sizing; max-3 cap; flip detection (new panel differs from prior); bond custody + forfeiture routing; exponential cost.

## Summary of Changes

Implemented the permissionless `appeal` instruction + `claim_appeal_refund` crank
(ADR-0004), with full LiteSVM TDD coverage (8 new tests; all 78 program tests green).

### New instructions

- `appeal` — permissionless; gates on `RoundResolved` + within the appeal window +
  under `max_appeals` + enough stakers for the larger panel. Custodies `N_new·fee`
  (juror fee) + an equal appeal bond, opens a fresh round at `2N+1`
  (`current_round += 1`, state to `Created` so the snapshot to draw to vote cycle reruns).
- `claim_appeal_refund(round_idx)` — permissionless crank returning flipped bonds to
  their appellants; idempotent (zeros the bond on refund).

### Bond model (ADR-0004 economics)

- Each appeal custody is a per-appeal `AppealBond` PDA `["bond", dispute, round]`
  recording appellant, amount, and the `prior_result` it sought to flip.
- `finalize_dispute` settles bonds ledger-style: a no-flip bond
  (`prior_result == final_ruling`) is folded into the final-round coherent pool and
  consumed (zeroed); a flipped bond is left outstanding for `claim_appeal_refund`.

### Key design decision: AppealBond PDAs, not Dispute fields

Appeal state was first modeled as fixed arrays on `Dispute`, but a larger `Dispute`
trips an anchor-litesvm CPI edge case (access violation in `finalize_snapshot` token
transfer, confirmed via a 128-byte dummy probe). Per-appeal PDAs keep `Dispute` at
its original size, so all existing `finalize_snapshot` paths stay green.

### Other edits

- `create_subaccord` now bounds `max_appeals` to `MAX_APPEALS` (3).
- `Appealed` event carries `appellant` + `bond`.
- `finalize_dispute` `remaining_accounts` = juror stakes + one `AppealBond` per
  appeal (backward-compatible: no appeals means juror stakes only).

### Out of scope (deferred to veridao-nhbj Hardening / known gap)

Cross-round settlement: `finalize_dispute` settles only the final round jurors;
intermediate rounds juror fees/slashing and shared-juror `active_draws` decrements
are not re-settled against the final ruling (Kleros §4.6). Formal `.qedspec` also
deferred to the hardening bean.
