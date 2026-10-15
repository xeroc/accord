---
# accord-spht
title: Join-gate evaluator
status: todo
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T07:32:41Z
parent: accord-n5v4
---

src/join/gates.ts pure function Subaccord→JoinDecision with reasons: token allowlists, min_stake + fee_per_juror ranges, alpha_bps cap, Plurality only, commit_window floor, global budget, per-subaccord cap, reserve floor. AC: table-driven unit tests incl. boundary cases; every reject path carries a reason.
