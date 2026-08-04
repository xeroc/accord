---
# veridao-b2sc
title: unstake instruction
status: todo
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-04T02:40:17Z
parent: veridao-wyso
blocked_by:
    - veridao-ja2w
    - veridao-ek65
---

Withdraw from vault; revert while active_draws>0. TDD: blocked-while-drawn revert; succeeds when active_draws==0; partial withdraw rounding. Security: cumulative cap, exact-remainder accounting.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.

## Dependency note (2026-08-04)

Blocked on `veridao-ja2w` (stake) and `veridao-ek65` (create_subaccord). unstake withdraws from the Subaccord stake-pool vault and decrements a `JurorStake` — both are created by stake/create_subaccord. In this Critical-risk money path the vault-authority + SPL transfer mechanics must be established once (by stake) and reused, not reverse-engineered from a withdrawal built first (risks divergence across stake/unstake/appeals-redistribution). Recommended order: create_subaccord -> stake -> unstake. Left as `todo` + blocked-by so the lane re-dispatches once unblocked.
