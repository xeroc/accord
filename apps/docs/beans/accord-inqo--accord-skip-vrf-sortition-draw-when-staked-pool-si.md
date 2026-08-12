---
# accord-inqo
title: Accord — skip VRF sortition draw when staked pool size == panel size
status: draft
type: task
priority: normal
created_at: 2026-08-11T21:08:02Z
updated_at: 2026-08-12T01:10:15Z
---

Why: optimization. When staker_count == panel_size, EVERY staked juror is seated — there is no selection to make, so the full VRF path (seed derivation hashv, per-seat collision re-roll verification, seat-stake range checks in draw_seat lib.rs ~1103-1163) is pure overhead. Lets the Arena MVP (pool=1, N=1) ship without exercising the full draw ceremony, and speeds up any small-pool Subaccord. Pairs with accord-9q3e (the panel size must be known to compare against the pool).

Change: in draw_seat (lib.rs ~1050-1230), short-circuit when the (frozen) staker count equals the panel size: seat jurors directly in tree_index order, skip the per-seat VRF seed + collision-retry verification. Still write seat_prefix/seat_stake for finalize_round/finalize_dispute consistency, still require distinct jurors, still do the inflation + slash_reserve guard via remaining_accounts[0].

Soundness: when pool == panel there is nothing to be unpredictable about (all jurors serve) and nothing to copy (unpredictability only matters when a subset is drawn). So skipping the lottery loses no guarantee.

Liveness caveat to DOCUMENT (not a bug in this optimization): at pool == panel, a no-show CANNOT be redrawn — there are no undrawn jurors left, so redraw (draw_attempt++) re-selects from the same exhausted set. A shortfall therefore goes to Failed (or, at N=1 single-operator, stalls until max_draw_attempts exhaustion). This is inherent to pool == panel; the optimization must not mask it. The fix for Arena liveness is growing the pool (the (b) target architecture), at which point pool > panel and the standard VRF redraw path reactivates.

Depends on: accord-9q3e (configurable panel size).

TDD (LiteSVM): pool == panel fast path produces the SAME juror set the full VRF path would; pool > panel still routes through VRF; no-show at pool == panel reaches Failed as expected.
