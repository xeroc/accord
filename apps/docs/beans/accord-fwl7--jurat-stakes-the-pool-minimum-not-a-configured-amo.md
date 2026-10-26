---
# accord-fwl7
title: Jurat stakes the pool minimum, not a configured amount
status: completed
type: task
priority: normal
created_at: 2026-10-16T08:54:52Z
updated_at: 2026-10-16T09:52:19Z
parent: accord-n5v4
---

JURAT_STAKE_AMOUNT is wrong on two axes: each Subaccord defines its own min_stake (stake exactly that — upstaking is manual by design), and a single env amount cannot be unit-correct across different staking mints. Remove the knob; amount = Subaccord.minStake everywhere (gates, executor, book budget accounting). Same disease in the budget: totalStaked sums entries across DIFFERENT tokens — make budget arithmetic per staking token (book entries already record stakingToken). Gates reject min_stake == 0 pools (zero stake = no draw weight). Update jurat unit suites, the e2e budget shape + leaf sync, config/SPEC/.env.example, and the pending changeset.

## Summary of Changes

- Diagnosis confirmed: a single configured per-join amount cannot be unit-correct across pools with different staking mints, and the pool's own min_stake is the natural join amount (upstaking stays manual, milestone decision 9).
- JURAT_STAKE_AMOUNT removed entirely (config field, required-parse, boot cap check, .env.example, SPEC). JoinPolicy/JoinBudget drop stakeAmount; the join amount IS sub.minStake in gates (zero-minimum pools now rejected: no draw weight) and the executor (BelowMinStake reject path deleted as unreachable; InvalidAmount thrown on min_stake == 0).
- Budget arithmetic is now per staking token: totalStaked(book, token?) filters by mint; the executor and the runtime scan evaluator count only same-mint book entries (a USDC entry no longer eats a house-token budget).
- e2e: jurat.spec stakes the pool min and exercises the documented manual-upstake flow — draw #1 reserves its alpha-bond out of the floor (draw_seat.rs free_stake >= min_stake), so an exact-min juror is single-duty until reconcile; the failing-LLM twin tops jurat back up before its concurrent draw.
- Verification: jurat unit suite 173 green, tsc + eslint clean, full make test green (27/27 suites, 119/120 — one offline-lane skip).
