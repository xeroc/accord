---
# veridao-o8ki
title: Staking methods
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/staking.ts: stake (ATA + token transfer wiring), unstake. Facade surfaces a typed guard rejecting unstake while active_draws > 0 (matches on-chain error, fail before tx). Acceptance: stake/unstake Ix builds; active_draws guard unit-tested. See ADR-0010.
