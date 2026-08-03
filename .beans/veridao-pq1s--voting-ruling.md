---
# veridao-pq1s
title: Voting & Ruling
status: todo
type: epic
priority: normal
created_at: 2026-08-03T23:09:55Z
updated_at: 2026-08-03T23:09:55Z
parent: veridao-rlno
blocked_by:
    - veridao-fr1x
---

Commit-reveal voting + finalization economics.

## Tasks

- [ ] commit(dispute, h) — h = hash(vote, salt, juror_pubkey); one per drawn juror; immutable after commit
- [ ] reveal(dispute, vote, salt) — verify h; record vote; non-reveal penalized (>= incoherent)
- [ ] finalize_round / finalize_dispute — permissionless crank; tally (plurality); on final round: slash alpha*min_stake per incoherent, redistribute fees+slash equally to coherent, decrement active_draws, write final ruling
- [ ] get_ruling(dispute) — read-only; Arbitrable reads final_ruling

## Acceptance (TDD)

Commit-copying prevention (pubkey in hash); reveal-window gates; coherence math exactness (rounding-safe); cross-round settlement vs final ruling; crank advances on window expiry.
