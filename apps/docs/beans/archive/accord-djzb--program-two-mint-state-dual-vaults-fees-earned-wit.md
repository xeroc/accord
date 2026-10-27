---
# accord-djzb
title: "Program: two-mint state + dual vaults + fees_earned + withdraw_fees + invariant"
status: completed
type: task
priority: high
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T19:00:00Z
parent: accord-edz4
---

assigned: implementer. See milestone HANDOFF §2. Files: state.rs (rename amount→staked, settlement_delta→stake_delta, +fees_earned; Subaccord +fee_token; CaseTerms fields), layout.rs (JS_*_OFF + offsets_match_borsh), lib.rs (stake/withdraw→stake_vault; create_dispute/appeal→fee_vault; reveal fee-removal; new withdraw_fees; settle writes fees_earned+stake_delta), constants.rs, errors.rs, events.rs. Wire assert_fund_invariants.

## Summary of Changes

**ADR-0020 E1 program implementation — two-mint/two-vault economics.**

### state.rs

- `JurorStake`: renamed `amount → staked`, `settlement_delta → stake_delta`; added `fees_earned: u64` (fee_token aggregate, withdrawable via `withdraw_fees`, no active_draws gate).
- `Subaccord`: added `fee_token: Pubkey` (compensation mint, distinct from `staking_token`).
- `CreateSubaccordParams`: added `fee_token: Pubkey`.

### lib.rs — layout module

- Renamed offset consts: `JS_AMOUNT_OFF → JS_STAKED_OFF`, `JS_SETTLEMENT_DELTA_OFF → JS_STAKE_DELTA_OFF`.
- Added `JS_FEES_EARNED_OFF` (+ width consts for intervening fields).
- `layout_tests::offsets_match_borsh`: updated fixture + assertions for renamed/new fields.

### lib.rs — instructions

- `create_subaccord`: accepts + stores `fee_token`; emits it in `SubaccordCreated`.
- `stake` / `withdraw`: renamed context field `vault → stake_vault`; updated all `amount → staked` refs.
- `request_withdraw` / `reconcile_stake`: updated `amount → staked`, `settlement_delta → stake_delta`.
- `create_dispute`: fee now flows into `fee_vault` (ATA of `fee_token`); context uses `fee_token` mint + `init_if_needed` fee_vault.
- `reveal`: **fee-removal** — vote-recording only, no SPL transfer, no token accounts in context.
- `finalize_round`: **new fees_earned credit path** — credits each revealer `fees_earned += fee_per_juror`, decrements `dispute.fee_paid`. Panel JurorStake PDAs passed as `remaining_accounts`. (Threshold gate is E2/ADR-0021.)
- `finalize_dispute` / `settle_round_accounts`: **two-pool settlement** — stake pool (slash_total → coherent `stake_delta` in stake_token) + fee pool (non-revealer fees + forfeited bonds → coherent `fees_earned` in fee_token). Writes both `stake_delta` and `fees_earned` via CU-opt raw offsets.
- `appeal` / `claim_appeal_refund` / `cancel_dispute`: switched from `vault`/`staking_token` → `fee_vault`/`fee_token`.
- **NEW `withdraw_fees`**: per-juror, `fee_vault → juror fee_token ATA`, zeroes `fees_earned`. No active_draws gate, no timelock.

### errors.rs

- Added `NoFeesEarned` error.

### events.rs

- Added `fee_token` to `SubaccordCreated`; added `FeesWithdrawn` event.

### Verification

- `anchor build --ignore-keys`: clean (`.so` + IDL generated).
- `cargo test --features no-entrypoint --lib`: 7/7 pass (layout + accumulator math).
- `make lint`: clean.
- LiteSVM integration tests (`accumulator_litesvm.rs`): 58 compile errors from field/context renames — these are the **sibling task accord-sffz** scope (LiteSVM TDD rewrite for two-mint flows).
