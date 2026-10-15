---
# accord-fgxw
title: Duty tracker
status: todo
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T07:32:41Z
parent: accord-wryi
---

src/duty/tracker.ts: DutyRecord per (dispute, round, our seat) from Round.jurors; window math from Subaccord/CaseTerms (commit/reveal deadlines vs chain clock); state persistence. AC: unit tests for window edges, redraw (round_idx same, attempt+1), duplicate idempotency.
