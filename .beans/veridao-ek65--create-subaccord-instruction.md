---
# veridao-ek65
title: create_subaccord instruction
status: todo
type: task
priority: normal
created_at: 2026-08-03T23:10:14Z
updated_at: 2026-08-03T23:10:14Z
parent: veridao-wyso
---

Permissionless; init Subaccord PDA; risk_type+evidence_spec immutable; store authority (Pubkey::default=immutable) + evidence_operator + all params. TDD: happy path + re-init guard + canonical bump. Security: init-if-needed guard, namespace capture check.

**Parent:** Epic 1 (Foundation & Capital). **TDD:** RED->GREEN->REFACTOR. Risk: Critical.
