---
"@useaccord/sdk": patch
---

draw_seat/settle: read stake net of pending settlement losses (SR4-M-2, bean accord-maz4)

- The draw eligibility gate and the settlement slash cap both read the
  canonical `staked` ledger blind to pending `stake_delta` losses. A
  settled-but-unreconciled loser kept full selection weight and passed the
  gate at their pre-loss stake, so successive settlements slashed the same
  principal repeatedly; `reconcile_stake` then floored the loser at 0
  (discarding excess debt) while winners kept the credits — ledger claims
  could exceed vault custody, with same-mint pools exposing fee claims to
  the shortfall too.
- Fix: `effective_stake = staked + stake_delta` (floored at 0) now feeds
  both the gate and both settle passes — cumulative debits are collectible
  by construction. Custody conservation pinned by LiteSVM across sequential
  disputes + reconcile orders.
