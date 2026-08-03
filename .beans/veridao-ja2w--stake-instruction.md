---
# veridao-ja2w
title: stake instruction
status: todo
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-03T23:10:14Z
parent: veridao-wyso
---

SPL transfer staking_token into Subaccord PDA vault; init/update JurorStake (amount). TDD: happy path balance assertions; wrong mint revert; wrong vault owner revert. Security: token-account ownership, fee-on-transfer delta handling.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.
