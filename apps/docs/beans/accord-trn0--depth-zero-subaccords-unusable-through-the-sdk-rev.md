---
# accord-trn0
title: 'Depth-zero Subaccords unusable through the SDK (REVIEW #13)'
status: completed
type: bug
priority: normal
created_at: 2026-08-06T21:42:00Z
updated_at: 2026-08-06T21:42:00Z
parent: accord-yjno
---

REVIEW #13. The program accepts depth-0 Subaccords (depth <= 31; on-chain test at lib.rs:2952 explicitly covers depth 0 with an empty path), but the facade rejected empty paths in stake/requestWithdraw/reconcileStake — making a valid depth-0 pool impossible to stake into.

## Summary of Changes

- Removed the three `path.length === 0` rejections in packages/sdk/src/methods/staking.ts (stake, requestWithdraw, reconcileStake). The SDK's own MST builder already produces `[]` as the canonical depth-0 proof (buildAccumulator + proofFor), and the on-chain verifier authenticates the path against the stored root + depth — so the facade guards were false gates, not real validation.
- Regression tests in packages/sdk/src/methods/staking.test.ts: (1) depth-0 accumulator -> proofFor yields []; (2) all three facade functions accept [] and forward it to the client seam. Guard verified: re-adding the reject makes the test fail.

45 SDK tests pass; workspace lint clean. Chose REVIEW option 2 (allow the canonical empty proof) over option 1 (reject depth 0 at creation).
