---
# veridao-fxao
title: Define all program state
status: todo
type: task
priority: high
created_at: 2026-08-03T23:10:13Z
updated_at: 2026-08-03T23:10:13Z
parent: veridao-wyso
---

Account structs (Subaccord, JurorStake, Dispute, Round, Snapshot, PendingUpdate), error enum, event structs, compile-time constants (MAX options, MAX_JURORS=31). Canonical PDA seeds + bumps stored. Acceptance: `anchor build` clean; structs match SPEC.md account table.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.
