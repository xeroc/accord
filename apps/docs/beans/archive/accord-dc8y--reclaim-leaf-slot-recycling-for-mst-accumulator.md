---
# accord-dc8y
title: Reclaim Leaf — slot recycling for MST accumulator
status: completed
type: feature
priority: normal
created_at: 2026-08-11T19:36:18Z
updated_at: 2026-08-31T18:03:02Z
---

Implement RECLAIM-LEAF spec: free-list linked list for tree slot recycling to close permanent DoS vulnerability. Adds reclaim_slot instruction, modifies stake to pop from free list, adds free_head to Subaccord + next_free to JurorStake.

## Summary of Changes (2026-08-31 — status reconciliation; work shipped earlier)

RECLAIM-LEAF landed in full: `reclaim_slot` instruction (`lib.rs`, permissionless free-list push), `free_head` on Subaccord + `next_free` on JurorStake, the free-list error family (`SlotNotDrained` / `SlotAlreadyReclaimed` / `FreeListHeadMismatch` / `SlotAwaitingRecycle`), LiteSVM suite (`reclaim_litesvm.rs`), Surfpool e2e (`reclaim.spec.ts`), and the H-1 pending-withdrawal precondition from the 2026-08-19 security review. Follow-up O(1) mid-list splice is parked separately as accord-b5v5. Bean was left in-progress after completion — closing it now.
