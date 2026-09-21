---
# accord-34p9
title: Frozen root snapshot — handle post-freeze stake changes in draw_seat
status: scrapped
type: task
priority: normal
created_at: 2026-08-09T20:15:53Z
updated_at: 2026-08-31T18:02:49Z
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

## Reasons for Scrapping (2026-08-31 — v1 substance already implemented; hardening deliberately deferred)

The bean's own acceptance bar was the v1 graceful-degradation path, and both halves shipped:

- On-chain: the inflation guard `require!(js.staked >= leaf.stake, InflatedStake)` in `draw_seat` (`programs/accord/src/instructions/draw_seat.rs:202`) rejects any draw whose live stake fell below the frozen leaf claim — a post-freeze withdraw can never seat a stale leaf.
- Cranker: `apps/cranker/src/tree-cache.ts` rebuilds the live accumulator and verifies `rootHash == dispute.frozenRoot` before drawing (`tree-cache.ts:116-125`), skipping + retrying on mismatch — exactly the documented workaround.

The three future-hardening ideas (event-based snapshot at VrfCommitted, on-chain freeze-time stake capture, indexer-maintained historical tree) were explicitly 'not v1' in this bean and die with it — refile as a fresh draft if freeze-time capture ever becomes a requirement (ADR-0012's on-chain accumulator already narrowed the problem to the freeze→draw window).
