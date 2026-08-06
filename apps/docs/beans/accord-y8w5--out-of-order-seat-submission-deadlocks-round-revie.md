---
# accord-y8w5
title: 'Out-of-order seat submission deadlocks round (REVIEW #6)'
status: in-progress
type: bug
priority: high
created_at: 2026-08-06T20:08:37Z
updated_at: 2026-08-06T20:08:37Z
---

draw_seat checks seat is unfilled but doesn't enforce sequential filling. A high-numbered seat filled first makes lower seats unfillable because collision verification only scans 0..seat. Fix: require seat == round.juror_count.
