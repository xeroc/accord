---
# accord-9yor
title: Create subaccord form
status: todo
type: task
created_at: 2026-08-07T23:09:07Z
updated_at: 2026-08-07T23:09:07Z
parent: accord-pjxh
---

Controlled form at /subaccords/new. Fields: stakingToken (address), minStake (bigint), alphaBps (0-10000), reviewWindow/commitWindow/revealWindow (seconds bigint), maxAppeals (0-3), feePerJuror (bigint), authority (address, default = connected wallet or Pubkey::default for immutable), evidenceOperator (default Pubkey::default), riskType (32-byte hex), evidenceSpec (default [0;32]), depth (default 20). On submit: derive subaccord PDA, build createSubaccord instruction via accord.methods, sendInstruction, redirect to /subaccords/:address.
