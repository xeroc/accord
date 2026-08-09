---
# accord-e539
title: draw_seat crank — per-seat tx with Merkle proof
status: todo
type: task
priority: normal
created_at: 2026-08-09T20:15:23Z
updated_at: 2026-08-09T20:15:32Z
parent: accord-7sky
blocked_by:
    - accord-gpo7
---

src/cranks/draw-seat.ts:

1. Get tree cache for the disputes Subaccord (from tree-cache task)
2. Read dispute.committedVrf + frozenRoot + frozenTotalStake
3. Compute vrf_seed = sha256(vrf ‖ dispute ‖ roundIdx ‖ drawAttempt)
4. For each seat (0..panel-1 not yet drawn):
   a. Compute r_i(retry) = u64_le(sha256(vrf_seed ‖ seat ‖ retry)) % totalStake
   b. Binary-search prefix ranges to find target juror
   c. Handle collisions (retry increments when r_i hits already-drawn juror)
   d. Build Merkle proof via SDK proofFor
   e. Build drawSeat instruction via SDK
   f. Send one tx per seat (1232-byte limit)
5. Register in dispatch map
