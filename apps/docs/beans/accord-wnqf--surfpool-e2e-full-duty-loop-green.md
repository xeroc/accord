---
# accord-wnqf
title: Surfpool e2e — full duty loop green
status: todo
type: task
priority: normal
created_at: 2026-10-15T07:33:06Z
updated_at: 2026-10-15T07:33:50Z
parent: accord-mehu
blocked_by:
    - accord-n5v4
    - accord-ji4v
    - accord-3tlt
    - accord-f3ir
---

e2e: fresh Surfnet, create gate-passing subaccord → jurat auto-joins → file dispute → VRF inject (harness vrf.ts) → draw → mock-LLM verdict → commit → warp → reveal → verify Round.votes + notification emitted; then a failing-LLM case → abstain + alert, no vote. dryRun OFF in this spec only. AC: jest spec green alongside the existing suite on one Surfnet (idempotent singleton guard).
