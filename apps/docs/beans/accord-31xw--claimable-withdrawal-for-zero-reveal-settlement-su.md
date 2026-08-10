---
# accord-31xw
title: Claimable withdrawal for zero-reveal settlement surplus
status: todo
type: task
priority: low
tags:
    - accord
created_at: 2026-08-10T15:07:30Z
updated_at: 2026-08-10T15:07:30Z
blocking:
    - accord-aqmw
---

When a round resolves with `reveal_count = 0` (degenerate `reveal_threshold_bps = 0` config), `settle_round_accounts` credits no juror — both the fee pool (filer fees + forfeited bonds in `fee_token`) and the stake pool (slashed stake in `staking_token`) are trapped as permanent Subaccord protocol surplus in their respective vaults.

This is the minimal-changes resolution of accord-aqmw: crediting any panel juror would reward a no-show, which the design prohibits. But the surplus is conserved yet unclaimable — no `JurorStake` has the `fees_earned` or `stake_delta` credit, so `withdraw_fees` and `unstake` can never release it.

## Acceptance criteria

- [ ] Design a mechanism to make the trapped surplus claimable by the Subaccord authority (protocol revenue).
- [ ] Fee-token surplus: either a `withdraw_protocol_fee_surplus` instruction (authority-gated SPL transfer from `fee_vault`) or credit the authority's `JurorStake.fees_earned` at settlement (requires passing it in `remaining_accounts`).
- [ ] Stake-token surplus: the slashed `stake_delta` is negative for all jurors with no offsetting positive credit. Either accept the ledger-vs-custody divergence permanently (document the invariant) or add a reconciliation path.
- [ ] Consider whether `reveal_threshold_bps = 0` should be rejected at Subaccord creation (eliminates the zero-reveal scenario entirely).
- [ ] Test the claim/surplus path end-to-end.
- [ ] Update security-checklist H-3 to remove the "trapped" caveat once claimable.

## Context

- Resolved as part of bean accord-aqmw (zero-coherent settlement economics).
- The `reveal_count > 0` path is handled: pools go to revealers. Only `reveal_count = 0` traps.
- The trapped-amount edge case only fires under `reveal_threshold_bps = 0` (default is 6666/2_3).
