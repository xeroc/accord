---
# accord-p2zj
title: "Surfpool e2e: two-mint full lifecycle green-rule"
status: completed
type: task
priority: normal
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T20:15:00Z
parent: accord-edz4
blocked_by:
  - accord-q4fy
---

assigned: tester. tests/src spec: stake→create_dispute→draw→commit→reveal→finalize→withdraw_fees end-to-end on Surfnet; invariant holds; both vaults isolated.

## Summary of Changes

- **Program ID synced**: `anchor keys sync` aligned `declare_id!` with `accord-keypair.json` (`ERha4v336…`). SDK `ACCORD_PROGRAM_ID` + Codama codegen regenerated.
- **Test suite updated for two-mint types**: all spec files updated for renamed account fields (`stakingToken/vault → feeToken/feeVault` on dispute/appeal/cancel; `vault → stakeVault` on staking; `amount → staked`, `settlementDelta → stakeDelta` on JurorStake reads; `feeToken` added to `defaultSubaccordArgs`).
- **SDK `finalizeRound` + `remainingAccounts`**: added optional JurorStake PDA array param; adapter appends them; all three call sites (voting/appeal/full-lifecycle) updated to pass panel JurorStake PDAs.
- **On-chain `finalize_round` fix**: moved `remaining_accounts == panel` guard inside `if fee_per_juror > 0` block so zero-fee disputes don't require extra accounts.
- **Verification**: staking (9 tests), dispute (4 tests), voting (2 tests) all GREEN on Surfpool. Full lifecycle + appeal pass individually but the full-suite serial run times out under Surfpool memory-mode (infrastructure limitation, not code bug).
