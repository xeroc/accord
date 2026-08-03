---
# veridao-63v3
title: pause/unpause circuit breaker
status: todo
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-03T23:10:14Z
parent: veridao-wyso
---

Multisig-gated (signer==upgrade-authority/multisig). pause instant; unpause timelocked. Halts new create_dispute/stake/appeal; in-flight disputes resolve. TDD: unauthorized revert; pause+unpause flow.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.
