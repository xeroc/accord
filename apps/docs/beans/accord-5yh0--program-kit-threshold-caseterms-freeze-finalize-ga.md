---
# accord-5yh0
title: 'Program: kit threshold + CaseTerms freeze + finalize gate + redraw + draw_attempt + Failed'
status: todo
type: task
priority: high
created_at: 2026-08-07T18:07:45Z
updated_at: 2026-08-07T18:52:32Z
parent: accord-z8jp
blocked_by:
    - accord-djzb
---

assigned: implementer. See HANDOFF §2/§4. Files: state.rs (Subaccord reveal_threshold_bps/shortfall_policy/max_draw_attempts; CaseTerms freeze; Round +draw_attempt), lib.rs (finalize_round threshold gate + fees_earned credit; new redraw crank slashing no-shows to stake_delta; draw_seat seed +draw_attempt; max_draw_attempts→Failed refund), errors.rs, events.rs, constants.rs.

## Blocker (verified 2026-08-07T18:52:32Z)

Hard-blocked on `accord-djzb` (E1 program: two-mint state). This bean's lib.rs deliverables require E1 fields that do not exist in the codebase yet and are owned by djzb:

- `finalize_round ... fees_earned credit` -> needs `JurorStake.fees_earned` (djzb owns `+fees_earned`)
- `redraw crank slashing no-shows to stake_delta` -> needs `stake_delta` (djzb owns the `settlement_delta -> stake_delta` rename)
- `max_draw_attempts -> Failed refund` -> needs the `fee_vault` refund path (djzb owns dual-vault wiring)

Verified state: `JurorStake` still has `amount`/`settlement_delta` (pre-rename); no `fee_token`/`fee_vault`/`stake_vault` anywhere. ADR-0019 (accord-8m2a) already landed; only E1 remains. Per milestone: E1 ships first and establishes struct field order. Did not absorb djzb scope (would collide) or stub fields (broken intermediate). Unblocks automatically once djzb lands; re-dispatch then.
