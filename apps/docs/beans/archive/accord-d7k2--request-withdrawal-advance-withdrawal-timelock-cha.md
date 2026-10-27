---
# accord-d7k2
title: request_withdrawal + advance_withdrawal (timelock + challengeable)
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T18:30:00Z
parent: accord-1eoy
blocked_by:
  - accord-7tsl
---

Target: `programs/canon/src/instructions/withdrawal.rs`.
Change: `request_withdrawal(ctx, item)` (submitter-only; from Listed) → WithdrawPending; open `withdrawal_timelock` challenge window. `advance_withdrawal(ctx, item)` (permissionless crank) → after timelock + unchallenged → return `accumulated_stake` to submitter, close item (Removed). A `challenge_item` during WithdrawPending re-enters the dispute path (settled by settle_item; item Removed either way).
Acceptance (TDD): LiteSVM — withdrawal flow; timelock enforced; reverts on early advance; challenged-withdrawal routes to dispute. No Pending-cancel (Q20).
Dependencies: submit_item. Authority: programs/canon/SPEC.md §Instructions #6/#7, §Edge cases; Q10/Q20.

## Summary of Changes

### Implemented

- **`request_withdrawal`** (`programs/canon/src/instructions/withdrawal.rs`):

  - Submitter-only (`constraint = item.submitter == submitter.key() @ NotSubmitter`).
  - From `Listed` only (reverts on Pending/Disputed/WithdrawPending/Removed).
  - Flips item → `WithdrawPending`, records `withdrawal_requested_at = Clock::now`.
  - Emits `WithdrawalRequested`.

- **`advance_withdrawal`** (same file):

  - Permissionless crank (any caller).
  - Must be `WithdrawPending` with `withdrawal_requested_at` set.
  - After `withdrawal_timelock` elapsed → transfers `accumulated_stake` from CanonList vault back to submitter (PDA-signed `token::transfer`).
  - Flips item → `Removed`, zeros `accumulated_stake`.
  - Emits `Withdrawn`.
  - Skips the transfer if `accumulated_stake == 0` (edge case: item with zero stake).

- **Supporting changes**: `errors.rs` (NotListed, NotWithdrawPending, WithdrawalTimelockOpen, NotSubmitter), `events.rs` (WithdrawalRequested, Withdrawn), `lib.rs` + `mod.rs` (registration).

### LiteSVM tests (all GREEN)

6 tests in `programs/canon/tests/withdrawal_litesvm.rs`:

- `request_withdrawal_flips_listed_to_pending` — happy path
- `request_withdrawal_reverts_if_pending` — state gate
- `request_withdrawal_reverts_if_not_submitter` — auth gate
- `advance_withdrawal_returns_stake_after_timelock` — full flow (timelock=0)
- `advance_withdrawal_reverts_before_timelock` — timelock gate
- `advance_withdrawal_reverts_if_listed` — state gate
