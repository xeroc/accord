---
# accord-s2l5
title: 'Cross-Subaccord account substitution fix (REVIEW #1)'
status: completed
type: bug
priority: critical
created_at: 2026-08-06T16:09:31Z
updated_at: 2026-08-06T16:23:41Z
---

Add has_one = subaccord constraint to every dispute account in contexts that also carry a subaccord, preventing cross-pool account substitution (theft/state corruption). Affected: RequestVrf, CommitVrfCallback, Commit, Reveal, FinalizeRound, FinalizeDispute, SettleRound, Appeal, ClaimAppealRefund, CancelDispute. Add wrong-pool negative LiteSVM tests.

## Summary of Changes

### Fix

Added cross-pool substitution protection to every context that carries both `dispute` and `subaccord`:

- **9 contexts** via Anchor `has_one = subaccord` on the dispute account constraint:
  RequestVrf, CommitVrfCallback, Commit, Reveal, FinalizeRound, FinalizeDispute, SettleRound, ClaimAppealRefund, CancelDispute.
- **Appeal** via handler-body `require_eq!(dispute.subaccord, subaccord.key(), SubaccordMismatch)` — `has_one` in `try_accounts` overflows the BPF 4096-byte stack frame (Appeal has 11 accounts).

### New error

- `AccordError::SubaccordMismatch` — "Dispute does not belong to this Subaccord (cross-pool substitution rejected)."

### Tests (LiteSVM, `make test_unit`)

- `cancel_dispute_rejects_wrong_subaccord` — proves `has_one` rejects wrong pool
- `commit_rejects_wrong_subaccord` — proves `has_one` rejects wrong pool
- `settle_round_rejects_wrong_subaccord` — proves `has_one` rejects wrong pool
- All 15 accumulator tests + 5 pause/health tests pass.

### Verification

- `anchor build` — clean (no stack overflow)
- `make test_unit` — 20 tests pass (3 new)
- `make lint` — clean

### Files

- `programs/accord/src/lib.rs` — 9 `has_one` + 1 `require_eq!`
- `programs/accord/src/errors.rs` — `SubaccordMismatch` variant
- `programs/accord/tests/accumulator_litesvm.rs` — 3 wrong-pool tests + helpers
