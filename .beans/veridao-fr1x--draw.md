---
# veridao-fr1x
title: Draw
status: todo
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-03T23:09:55Z
parent: veridao-rlno
blocked_by:
    - veridao-rrxs
---

Select N distinct Jurors from the finalized Snapshot, weighted by stake, via Switchboard VRF.

## Tasks

- [ ] draw(dispute, vrf_result, juror_memberships[]) — consume Switchboard VRF; N distinct via cumulative-stake lookup; verify Merkle membership+weight; active_draws += 1 per juror; record drawn jurors

## Acceptance (TDD)

VRF consumption correctness; distinctness (no duplicate juror); Merkle proof verify (valid/invalid cases); active_draws increment; manipulation-resistance (VRF not predictable). Highest-risk instruction — deepest security review.
