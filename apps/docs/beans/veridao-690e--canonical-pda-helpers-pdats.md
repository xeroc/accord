---
# veridao-690e
title: Canonical PDA helpers (pda.ts)
status: todo
type: task
priority: normal
created_at: 2026-08-04T21:51:39Z
updated_at: 2026-08-04T21:52:57Z
parent: veridao-vxe9
blocked_by:
    - veridao-qlnn
---

Derive every Accord PDA in `src/pda.ts` using the generated client getProgramAddress helpers; seeds sourced from programs/accord/src/state.rs (Subaccord, JurorStake, Dispute, Snapshot, Round, PendingUpdate, PauseState, appeal refund PDAs). One exported fn per PDA returning {address, bump}. Acceptance: every PDA in state.rs has a helper; helper output matches an on-chain derivation smoke test. See ADR-0010.
