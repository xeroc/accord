---
# veridao-yny6
title: Appeal & refund methods
status: todo
type: task
created_at: 2026-08-04T21:51:58Z
updated_at: 2026-08-04T21:51:58Z
parent: veridao-gqzm
---

src/methods/appeal.ts: appeal (permissionless; 2N+1 panel scaling), claim_appeal_refund (idempotent, per round_idx). Acceptance: appeal Ix builds for each round; claim_appeal_refund derives the round refund PDA. See ADR-0004 + ADR-0010.
