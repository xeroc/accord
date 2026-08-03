---
# veridao-b2sc
title: unstake instruction
status: todo
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-03T23:10:14Z
parent: veridao-wyso
---

Withdraw from vault; revert while active_draws>0. TDD: blocked-while-drawn revert; succeeds when active_draws==0; partial withdraw rounding. Security: cumulative cap, exact-remainder accounting.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.
