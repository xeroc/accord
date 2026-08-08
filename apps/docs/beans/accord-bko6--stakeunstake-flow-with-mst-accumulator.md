---
# accord-bko6
title: Stake/unstake flow with MST accumulator
status: completed
type: task
created_at: 2026-08-07T23:09:16Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-pbff
---

Route /juror/stake. Subaccord selector (address input or query param). On select: fetch subaccord (rootHash, nextIndex, depth) + all JurorStakes via findJurorStakesBySubaccord. Sort by treeIndex, build MST via buildAccumulator(leafClaims), verify root === subaccord.rootHash. Determine if new (index=nextIndex) or existing staker (index=jurorStake.treeIndex). Compute proof via proofFor(accumulator, index). Build stake instruction: accord.methods.stake(accounts, amount, path). Unstake: requestWithdraw (same proof) then withdraw after delay. Check canUnstake guard (active_draws==0).

## Summary of Changes

Implemented the core MST accumulator proof orchestration for stake/unstake at
the SDK level (`packages/sdk/src/`), plus the typed `getProgramAccounts` query
wrapper the frontend needs. These are the verifiable, non-conflicting
primitives; the React `/juror/stake` page wires them once the app scaffold
(accord-cb9q/accord-27lf) lands.

### New files

- **`packages/sdk/src/queries.ts`** — `findJurorStakesBySubaccord(rpc,
programId, subaccord)`: typed `getProgramAccounts` wrapper. Filters by
  memcmp at offset 8 (subaccord field) + dataSize (129). Decodes each
  JurorStake with the generated codec. The frontend never touches raw bytes.
- **`packages/sdk/src/methods/stakeFlow.ts`** — `prepareStakeProof(subaccord,
jurorStakes, juror)`: the full MST accumulator orchestration — sort by
  treeIndex → build accumulator → verify root → determine juror index (new
  vs existing) → compute Merkle proof. Pure (no chain access); testable.
- **`packages/sdk/src/methods/stakeFlow.test.ts`** — 10 unit tests covering:
  new staker (empty tree, non-empty tree), existing staker, unsorted input,
  root mismatch (stale data, wrong amounts), depth-0 (REVIEW #13 empty path),
  InvalidTreeIndex, TreeFull.

### Modified files

- **`packages/sdk/src/index.ts`** — exports `findJurorStakesBySubaccord`,
  `JurorStakeAccount`, `prepareStakeProof`, `SubaccordAccumulatorView`,
  `JurorStakeLeaf`, `StakeProofResult`.

### What's NOT included (depends on scaffold beans)

The React `/juror/stake` route page itself depends on:

- `accord-cb9q` (app scaffold + infrastructure) — `apps/app` Vite + React
- `accord-27lf` (Vite + React + Tailwind v4 + HashRouter)
- `accord-y5av` (ConnectorKit provider + cluster config)
- `accord-bobu` (useAccord hook + shared transaction utilities)

These are all `todo` / in-flight in parallel worktrees. The page will call
`findJurorStakesBySubaccord` → `prepareStakeProof` → `stake` /
`requestWithdraw` / `withdraw` + `canUnstake` guard.

### Verification

- `pnpm --filter @useaccord/sdk run lint` — clean (tsc --noEmit)
- `npx tsx --test src/methods/stakeFlow.test.ts` — 10/10 pass
