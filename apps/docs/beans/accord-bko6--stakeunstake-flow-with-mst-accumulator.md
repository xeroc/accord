---
# accord-bko6
title: Stake/unstake flow with MST accumulator
status: todo
type: task
created_at: 2026-08-07T23:09:16Z
updated_at: 2026-08-07T23:09:16Z
parent: accord-pbff
---

Route /juror/stake. Subaccord selector (address input or query param). On select: fetch subaccord (rootHash, nextIndex, depth) + all JurorStakes via findJurorStakesBySubaccord. Sort by treeIndex, build MST via buildAccumulator(leafClaims), verify root === subaccord.rootHash. Determine if new (index=nextIndex) or existing staker (index=jurorStake.treeIndex). Compute proof via proofFor(accumulator, index). Build stake instruction: accord.methods.stake(accounts, amount, path). Unstake: requestWithdraw (same proof) then withdraw after delay. Check canUnstake guard (active_draws==0).
