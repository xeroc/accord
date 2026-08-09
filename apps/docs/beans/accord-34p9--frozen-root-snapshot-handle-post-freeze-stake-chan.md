---
# accord-34p9
title: Frozen root snapshot — handle post-freeze stake changes in draw_seat
status: draft
type: task
created_at: 2026-08-09T20:15:53Z
updated_at: 2026-08-09T20:15:53Z
parent: accord-7sky
---

## Problem

When a juror calls request_withdraw between VRF commit (root freeze) and draw_seat, their staked amount drops. The frozen root still commits to the old (higher) stake. The cranker reconstructs the tree from CURRENT JurorStake data, getting a root that does not match frozenRoot.

## Current workaround

Cranker verifies reconstructed root == dispute.frozenRoot before draw_seat. On mismatch: skip, retry next cycle. Graceful degradation.

## Future hardening (not v1)

1. Event-based tree snapshot at VrfCommitted
2. On-chain freeze-time stake capture
3. Indexer-maintained historical tree

Not a blocker — skip+retry is acceptable for v1.
