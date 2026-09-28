---
"@useaccord/sdk": minor
---

Minimum juror position is now `min_stake` (ADR-0035): `draw_seat` requires free stake ≥ `min_stake` (the per-draw α·min_stake bond is reserved out of the floor — a juror holding exactly `min_stake` is drawable), the `stake` opening gate floors the first deposit at `min_stake`, and `reconcile_stake` ejects a fold landing strictly between 0 and `min_stake` — zero-weight leaf, remainder returned via the two-phase withdraw rail. An incoherent vote now drops the juror below the floor and ejects them outright. No IDL change.
