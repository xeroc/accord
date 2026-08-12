---
# accord-dc8y
title: Reclaim Leaf — slot recycling for MST accumulator
status: in-progress
type: feature
created_at: 2026-08-11T19:36:18Z
updated_at: 2026-08-11T19:36:18Z
---

Implement RECLAIM-LEAF spec: free-list linked list for tree slot recycling to close permanent DoS vulnerability. Adds reclaim_slot instruction, modifies stake to pop from free list, adds free_head to Subaccord + next_free to JurorStake.
