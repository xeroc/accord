---
# accord-5pkj
title: Join executor
status: completed
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T09:32:41Z
parent: accord-n5v4
---

src/join/executor.ts: balance checks, SDK stake() ix, budget accounting + joined-subaccord book in state dir, idempotent re-run. AC: unit tests with fake client; Surfpool join covered by e2e.

## Summary of Changes

- `apps/jurat/src/join/executor.ts` — `joinSubaccord(chain, {juror, subaccord, budget, stateDir})`:
  - Order: Subaccord-local rejects (attestation-gated, BelowMinStake, OverSubaccordCap) → global budget vs book sum (target pool's own entry excluded) → on-chain idempotency (existing `staked > 0` short-circuits to `already-joined` and reconciles a missing book entry — crash between send and book-write heals on re-run) → balance checks (token ATA ≥ amount + reserveFloor, SOL ≥ fee floor) → proof → send → atomic book write.
  - Free-list-aware proof (RECLAIM-LEAF, accord-b5v5): rebuilds the accumulator with leaves blanked for every slot reachable from `free_head` (raw JurorStake accounts alone cannot rebuild the root of a reclaimed pool), verifies against the stored root (`AccumulatorRootMismatch` on stale fetch), and picks the slot + remaining-account neighbors the on-chain handler assigns: pop-the-head + freed/new-head neighbors for a new staker on a pool with a free list, splice-self-out with predecessor/successor for a returning juror whose slot was reclaimed, plain top-up / nextIndex otherwise. `prepareStakeProof` alone cannot express these (new-staker index assumption + non-blanked leaves).
  - Builds the ix via the SDK `stake()` pure fn over a `Pick<AccordStakingClient, "buildStake">` seam; PDAs/ATAs via SDK helpers. All impure access behind the `JoinChain` seam (real impl lands with the chain client, bean accord-lii9).
- `apps/jurat/src/join/book.ts` — joined-subaccord book: `loadBook` (missing file = empty), `saveBook` (atomic tmp+rename), `totalStaked`, `upsertEntry`. ponytail-ceiling noted in the module doc: book sums are join-time amounts, not post-slash truth.
- `apps/jurat/src/join/executor.test.ts` + `book.test.ts` — 17 tests green (bun): happy join (full canonical account set asserted; proof verified against `emptyRoot` via `verifyMembership`), idempotent re-run, crash recovery, all six reject reasons, SubaccordNotFound + stale-root throws, free-list pop (index = freeHead + neighbor accounts), own-slot splice (predecessor neighbor), drained in-place top-up.
- `apps/jurat/package.json` + `tsconfig.json` — minimal private `@useaccord/jurat` (bun test, tsc --noEmit) so the module compiles and the suite runs; full scaffold (eslint, main.ts, .gitignore, .env.example) remains with bean accord-ga1b.
- `pnpm-lock.yaml` — new importer for apps/jurat (frozen install verified green).

Verification: `pnpm --filter @useaccord/jurat build` (tsc --noEmit) green; `bun test` 17/17 green; `pnpm install --frozen-lockfile` green. Surfpool e2e join rides the dedicated e2e bean (accord-mehu / accord-wnqf lane) as the bean AC states.
