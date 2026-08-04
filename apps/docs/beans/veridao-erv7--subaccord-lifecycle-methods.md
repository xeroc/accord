---
# veridao-erv7
title: Subaccord lifecycle methods
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/lifecycle.ts: create_subaccord, propose_subaccord_update, execute_subaccord_update (timelock-aware: wait execute_after_slot), and the pause quartet (initialize_pause, pause, propose_unpause, execute_unpause). Args + accounts from lib.rs. Acceptance: each method builds + simulates its Ix; timelock flow surfaces execute_after_slot. See ADR-0010 §Business Logic.
