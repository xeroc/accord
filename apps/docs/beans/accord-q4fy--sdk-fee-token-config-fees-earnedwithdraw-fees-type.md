---
# accord-q4fy
title: "SDK: fee_token config, fees_earned/withdraw_fees types, fee_vault PDA"
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T19:20:00Z
parent: accord-edz4
blocked_by:
  - accord-djzb
---

assigned: implementer. Expose fee_token in createSubaccord params; fees_earned on JurorStake type; withdrawFees() facade + fee_vault PDA helper; update codama/kit types.

## Summary of Changes

- **Codama codegen regenerated** from new IDL (Subaccord +feeToken, JurorStake staked/feesEarned/stakeDelta, withdrawFees instruction, all vault→stakeVault/feeVault renames).
- **CreateSubaccordArgs**: added `feeToken: Address`.
- **JurorStakeView**: renamed `amount → staked`; added `feesEarned: bigint`.
- **StakingAccounts**: renamed `vault → stakeVault`.
- **CreateDisputeAccounts**: `stakingToken/vault → feeToken/feeVault`.
- **CancelDisputeAccounts / AppealAccounts / ClaimRefundAccounts**: `stakingToken/vault → feeToken/feeVault`.
- **NEW withdrawFees()**: facade + `WithdrawFeesAccounts` type + `buildWithdrawFees` seam. Wired into methods.ts + adapter.ts + AccordMethods interface.
- **Adapter**: all instruction builders updated for new account field names; Reveal adapter simplified (no token accounts); withdrawFees adapter wired.
- **Reveal**: token account fields removed from VotingAccounts (vote-recording only per ADR-0020).
- `make lint` + `pnpm build` clean.
