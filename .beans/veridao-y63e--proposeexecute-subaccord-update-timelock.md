---
# veridao-y63e
title: propose/execute_subaccord_update (timelock)
status: todo
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-03T23:10:14Z
parent: veridao-wyso
---

Authority-gated (signer==authority, authority!=default). propose -> PendingUpdate with execute_after_slot (48h); execute after slot elapsed. Stakers can unstake before execution. TDD: unauthorized signer revert; execute-before-deadline revert; execute-after-deadline succeeds (time travel).

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.
