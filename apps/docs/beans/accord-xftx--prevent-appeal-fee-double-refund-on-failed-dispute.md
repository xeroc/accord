---
# accord-xftx
title: Prevent appeal fee double refund on failed disputes
status: completed
type: bug
priority: high
created_at: 2026-08-10T02:17:26Z
updated_at: 2026-08-10T16:05:51Z
---

## Problem

A real `appeal` adds `fee_new` to `dispute.fee_paid` while also recording `fee_new + bond` in `AppealBond.amount`. If the dispute is later cancelled or fails, `cancel_dispute` refunds all of `dispute.fee_paid` to the original filer and `claim_appeal_refund` refunds the full appeal-bond amount to the appellant. The appeal fee is therefore claimable twice from the shared vault.

Relevant code:

- `programs/accord/src/lib.rs:1691-1698`
- `programs/accord/src/lib.rs:1740-1750`
- `programs/accord/src/lib.rs:2020-2047`
- `programs/accord/tests/accumulator_litesvm.rs:1823-1993`

With `fee_per_juror = 1M` and one appeal, 17M is deposited but 24M can be requested: 10M by the filer and 14M by the appellant. The excess is taken from other vault liabilities or causes the second claim to fail. The existing test fabricates the appeal state without applying `fee_paid += fee_new`, hiding the bug.

## Acceptance Criteria

- [ ] Define non-overlapping ownership for the original filing fee, appeal-round fees, and appeal bonds on `Failed`.
- [ ] Cancellation and redraw-exhaustion cannot refund appeal fees both through `fee_paid` and `AppealBond.amount`.
- [ ] Add a regression that uses the real `appeal` instruction, or faithfully reproduces every state write made by it.
- [ ] Assert total successful refunds never exceed that dispute's deposits and cannot consume a second dispute's funds.
- [ ] Cover both `cancel_dispute` and redraw-exhaustion failure paths.
- [ ] Update accounting documentation and security-checklist status.
