---
# accord-5ipb
title: State — CanonList, CanonItem, ItemState, PDAs, constants
status: todo
type: task
priority: high
created_at: 2026-08-07T23:00:47Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-4y4i
blocked_by:
    - accord-k6us
---

Target: `programs/canon/src/state.rs` (+ `constants.rs`).
Change: define `CanonList` and `CanonItem` structs with the fields/seeds in programs/canon/SPEC.md §Account/PDA model; `ItemState` enum (Pending/Listed/Removed/WithdrawPending/Disputed); PDA seed constants (`["canon", creator, rules_hash]`, `["canon-item", list, account]`); the v1 canonical-default constants from programs/canon/SPEC.md §v1 canonical defaults (initial_num_jurors=3, max_appeals=3, alpha_bps=1000, fee_per_juror=10, submit_deposit=500, challenge_pct=5000 bps, listing_window/withdrawal_timelock=5d) + `MAX_*`. Anchor `#[derive(InitSpace)]`.
Acceptance: structs compile; every field/seed matches SPEC; defaults present as named constants.
Dependencies: scaffold.
