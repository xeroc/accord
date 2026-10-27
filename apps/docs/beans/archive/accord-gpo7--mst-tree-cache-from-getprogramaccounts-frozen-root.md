---
# accord-gpo7
title: MST tree cache from getProgramAccounts + frozen root verification
status: completed
type: task
priority: normal
created_at: 2026-08-09T20:15:13Z
updated_at: 2026-08-09T22:04:10Z
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

## Summary of Changes

- `apps/cranker/src/tree-cache.ts` — `TreeCache` class + pure
  `buildAccumulatorFromStakes` helper.
  - `get(subaccord)`: fetches the live Subaccord (cheap root check), returns the
    cached accumulator when the root is unchanged, rebuilds via SDK
    `findJurorStakesBySubaccord` + `buildAccumulator` on root change.
  - `getVerifiedForDispute(dispute)`: verifies the rebuilt root matches
    `dispute.frozenRoot`; returns the accumulator on match, `null` on mismatch
    (logs a structured warning — a juror staked/withdrew post-freeze, skip draw
    this cycle).
  - `buildAccumulatorFromStakes(stakes, depth)`: pure leaf-layout → MST build,
    placing each leaf at its canonical `treeIndex` and padding gaps with zero
    leaves (mirrors SDK `stakeFlow.ts` byte-exactly).
  - Fetchers are injectable (`fetchSubaccord` / `fetchStakes` overrides) so the
    cache logic is unit-testable with no validator.
- `apps/cranker/src/tree-cache.test.ts` — 7 unit tests covering: SDK-builder
  root parity, empty-pool root, out-of-range treeIndex throw, cache hit on
  stable root (GPA runs once), cache rebuild on root change, frozen-root match
  → accumulator, frozen-root mismatch → null + warning log.

### Verification

- `tsc --noEmit` — clean
- `eslint src/tree-cache.ts src/tree-cache.test.ts` — clean
- `bun test src/tree-cache.test.ts` — 7 pass / 0 fail
- Full cranker suite: 32 pass / 0 fail (no regressions)
