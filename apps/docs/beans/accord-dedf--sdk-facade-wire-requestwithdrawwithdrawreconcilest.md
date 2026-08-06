---
# accord-dedf
title: 'SDK facade: wire requestWithdraw/withdraw/reconcileStake/settleRound/cancelDispute (drop unstake)'
status: completed
type: task
priority: high
created_at: 2026-08-06T20:25:35Z
updated_at: 2026-08-06T20:32:41Z
---

Regenerated Codama output replaced unstake with two-phase requestWithdraw+withdraw (+reconcileStake). settleRound and cancelDispute builders already existed but lack facade wiring. Wire all five through adapter → methods → index. Verify: `pnpm --filter @accord/sdk run build`.

## Summary of Changes

- **packages/sdk/src/methods/staking.ts**: removed the async `unstake` function + the `buildUnstake` seam; added `requestWithdraw` (sync, ledger-only — no `active_draws` gate since the on-chain `request_withdraw` defers the lock to `withdraw`), `withdraw` (no args, reads `pending_withdrawal`), and `reconcileStake` (permissionless crank). Kept `canUnstake`/`assertCanUnstake`/`UnstakeGuard`/`assertValidAmount` as exported staking utilities (still valid for the withdraw-phase `active_draws` check).
- **packages/sdk/src/methods/settlement.ts** (new): `settleRound` + `cancelDispute` pure orchestration over a new `AccordSettlementClient` seam, with `remainingAccounts` for JurorStake/Round/AppealBond PDAs.
- **packages/sdk/src/adapter.ts**: swapped the `getUnstakeInstruction` import for the five new generated builders; `AccordAdapter` now composes `AccordSettlementClient`; wired `buildRequestWithdraw`/`buildWithdraw`/`buildReconcileStake`/`buildSettleRound`/`buildCancelDispute` (settlement methods use `appendRemaining`).
- **packages/sdk/src/methods.ts**: replaced `unstake` in `AccordMethods` with the three staking methods + two settlement methods; updated `createAccordMethods` bindings.
- **packages/sdk/src/index.ts**: re-exports `settlement.js`; updated comments.

Verified: `pnpm --filter @accord/sdk run build` + `lint` both green.

Note: the `tests/` workspace still references the removed `unstake`/`buildUnstake`/`canUnstake` adapter seam — out of scope (verification target was the SDK build). Follow-up needed to port the staking e2e spec to the two-phase model.
