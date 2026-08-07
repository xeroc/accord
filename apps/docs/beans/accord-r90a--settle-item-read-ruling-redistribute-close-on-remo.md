---
# accord-r90a
title: settle_item (read ruling → redistribute, close on remove)
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-1eoy
blocked_by:
    - accord-04m9
---

Target: `programs/canon/src/instructions/settle_item.rs`.
Change: permissionless `settle_item(ctx, item)` → require Disputed + Accord dispute finalized; read Accord `final_ruling`. `keep`: challenger's `challenge_stake` → `item.accumulated_stake` (progressive protection), fee consumed by jurors (Accord), Disputed → Listed (or WithdrawPending if it was a withdrawal challenge). `remove`: `accumulated_stake` → challenger (full-accumulated bounty), close the CanonItem (reclaim rent, re-submittable per Q18), Disputed → Removed. Handle withdrawal-challenge: on `keep` during a withdrawal, challenger's stake → submitter (frivolous-block penalty) and item still Removed.
Acceptance (TDD): LiteSVM — keep/remove redistribution exact; progressive protection grows on keep; item closed on remove (Q18); withdrawal-challenge paths correct.
Dependencies: challenge_item. Authority: programs/canon/SPEC.md §Instructions #5, §Economics; Q7/Q18.
