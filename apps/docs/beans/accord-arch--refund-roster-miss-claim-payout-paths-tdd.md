---
# accord-arch
title: refund_roster_miss + claim payout paths (TDD)
status: todo
type: task
created_at: 2026-08-18T05:28:20Z
updated_at: 2026-08-18T05:28:20Z
parent: accord-l2ad
blocked_by:
    - accord-nf9j
---

assigned: implementer
refund_roster_miss: deadline passed + roster incomplete → per-joined-party S refunds via paid_out bits (permissionless crank, idempotent, close when all joined bits paid). claim: reads bound dispute state — Final: winner pot N*S−fee, one-shot; neutral: S−fee/N floor each, remainder to last claimant; Failed: full S each (fee already returned by accord cancel_dispute). Tests: every HANDOFF §6 matrix row for refund/claim/neutral/failed, idempotency replays, invariant vault ≥ outstanding claims, missing-ATA party never blocks others. Pull-only payouts.
