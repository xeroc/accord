---
# veridao-rrxs
title: Dispute Intake & Snapshot Trust
status: todo
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-03T23:09:55Z
parent: veridao-rlno
blocked_by:
    - veridao-wyso
---

Filing a Dispute and establishing the trusted Juror-set Snapshot the Draw reads.

## Tasks

- [ ] create_dispute(subaccord, options, evidence_hash, fee) — [Arbitrable CPI]; filer pays full fee; revert if active distinct stakers < required N
- [ ] post_snapshot(dispute, merkle_root) — off-chain indexer; bond 1x max-appeal-fee
- [ ] challenge_snapshot(dispute, fraud_proof) — 1-day window; challenger bonds equal; wrong root -> poster bond to challenger; false challenge -> challenger bond to poster

## Acceptance (TDD)

CPI interface correctness; bond custody + sweepable authority; challenge-window time-gate (before/after deadline via Clock); insufficient-jurors revert.
