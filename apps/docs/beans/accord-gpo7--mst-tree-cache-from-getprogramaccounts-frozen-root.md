---
# accord-gpo7
title: MST tree cache from getProgramAccounts + frozen root verification
status: todo
type: task
priority: normal
created_at: 2026-08-09T20:15:13Z
updated_at: 2026-08-09T20:15:23Z
parent: accord-7sky
blocked_by:
    - accord-bpag
---

src/tree-cache.ts:

1. getProgramAccounts(JurorStake) filtered by Subaccord
2. Read each JurorStake.staked + tree_index via SDK decoder
3. Build MST via SDK buildAccumulator(leaves, depth)
4. Verify reconstructed root == dispute.frozenRoot
5. If mismatch: log warning, skip draw (juror withdrew post-freeze)
6. Cache per-Subaccord; rebuild when root changes
