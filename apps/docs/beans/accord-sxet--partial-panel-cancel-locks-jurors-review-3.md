---
# accord-sxet
title: 'Partial-panel cancel locks jurors (REVIEW #3)'
status: completed
type: bug
priority: critical
created_at: 2026-08-06T18:06:22Z
updated_at: 2026-08-06T18:11:51Z
---

Pre-draw cancel doesn't detect a partially-filled current Round. If 1 of N seats lands and later seats can't draw, cancel moves to Failed while drawn jurors keep active_draws > 0 forever. Fix: probe for current-round PDA in remaining_accounts, release its jurors, then continue to prior rounds + bonds.

## Summary of Changes

### Fix

Pre-draw cancel now probes for a partially-drawn current round. If any seats landed before the stall, those jurors' active_draws are released before the dispute transitions to Failed.

### Strict accounting

Both cancel branches now enforce `rounds_consumed + appeal_bonds == remaining_accounts.len()`. No round can be missed and no junk accounts slip through. `release_prior_rounds` returns the consumed index; bonds are read via the new `read_bond_amounts` helper at the verified offset.

### Test

`cancel_releases_partially_drawn_panel` — draws 1 of 3 seats, cancels, verifies active_draws released and dispute is Failed.

All 29 tests pass.
