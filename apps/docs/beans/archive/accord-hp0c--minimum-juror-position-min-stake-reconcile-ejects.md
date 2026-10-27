---
# accord-hp0c
title: Minimum juror position = min_stake; reconcile ejects sub-min leaves
status: completed
type: feature
created_at: 2026-09-28T07:07:47Z
updated_at: 2026-09-28T07:07:47Z
---

Economics change (Fabian's call, 2026-09-28): a juror must be drawable with exactly min_stake — the draw bond (α·min_stake) comes out of the floor instead of on top. (1) draw_seat gate free_stake >= min_stake (drop the +α term, REVIEW #5); (2) stake opening backstop at min_stake (was min+α, b72fb0c1); (3) clean ejection: reconcile_stake folding a delta that lands strictly between 0 and min_stake writes a zero-weight leaf and routes the remainder through the existing two-phase withdraw rail (pending_withdrawal + delay + active_draws==0), mirroring request_withdraw's staker_count decrement — no sub-min dust leaves for sortition (SR3-H-1 class). Design decisions: slash coverage unchanged (slash_reserve still reserves α per draw, staked >= Σ reserve); incoherent juror = ejected below floor, remainder returned. Docs in same change: lib.rs, SPEC.md, ADR-0021 passage, new ADR, security-checklist note.

## Design decisions (2026-09-28 implementation)

- **The old `min + α` was never post-slash protection** — a once-slashed minimum juror was already excluded from draws (free = min < min+α). What it bought: (a) the slash path never minted sub-min leaves, (b) one extra α of attacker capital against the unreconciled-delta window. Both are re-covered: (a) by the reconcile ejection, (b) unchanged in kind (permissionless reconcile + reconcile-before-withdraw remain the backstops). Full reasoning in ADR-0035.
- **Ejection reuses existing rails only**: zero-weight leaf via `verify_and_recompute(juror, 0)`, remainder via `pending_withdrawal`/`withdraw_requested_at` (paid by `withdraw` after `WITHDRAWAL_DELAY` + `active_draws == 0`), `staker_count` decrement mirrors `request_withdraw`'s full-exit branch, `Unstaked` event reused — **no IDL change, no codegen ripple**.
- **Re-entry**: an ejected juror re-stakes through the plain top-up branch (leaf `(juror, 0)` → `(juror, X)`; opening gate does not re-fire — top-ups ungated, same as today), counted again in `staker_count`.
- **Fold to exactly 0 (α=100%) or ≥ min_stake**: plain fold — unchanged behavior; ejection is strictly the `(0, min_stake)` interval.
- **qedspec**: no modeled handler's amount math touched (`slash_bounded` preserved; the gate weakening is draw-only, reconcile is unmodeled) — no qedspec change.

## Todos

- [x] RED tests: reconciled_slash_below_min_ejects_juror (ejection + rail + re-entry), minimal_stake_juror_is_drawable, first_stake_below_min_stake_reverts, reworked slash_reserve_blocks_draw_when_insufficient_free_stake
- [x] draw_seat gate: free ≥ min_stake (comment carries the 2026-09-28 revision note)
- [x] stake opening gate at min_stake
- [x] reconcile_stake ejection (zero-weight leaf + pending_withdrawal + staker_count + Unstaked)
- [x] Docs: lib.rs (stake/reconcile/draw_seat), SPEC rows 3+6, ADR-0021 passage amended, ADR-0035 + index row, security-checklist SR3-H-1 partial-mitigation note
- [x] apps/app StakePage mirror (minInitial = minStake + helper copy)
- [x] e2e staking.spec: below-min reverts (MIN_STAKE − 100), at-exactly-min succeeds
- [x] Unit lane green (workspace, 157 tests incl. canon/synod)
- [x] Full `make test` green (Rust + LiteSVM + jest e2e on Surfpool)
