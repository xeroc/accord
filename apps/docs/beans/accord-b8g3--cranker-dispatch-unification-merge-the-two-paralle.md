---
# accord-b8g3
title: Cranker dispatch unification — merge the two parallel CrankContext/dispatch contracts
status: completed
type: task
priority: normal
created_at: 2026-08-09T22:50:58Z
updated_at: 2026-08-09T23:11:46Z
parent: accord-27r5
---

Resolve the accord-t5rx merge by unifying on the factory dispatch + a single CrankContext in types.ts. Ports the 9 cranks to register(), draw-seat to ctx.accord, reconciler to build the unified ctx.

## Summary of Changes

Unified the two parallel dispatch contracts that collided in the accord-t5rx merge into one canonical design (factory wins, per the milestone's 'reconciler is authoritative' + 'dispatch map' spec).

**Canonical contract (`apps/cranker/src/types.ts`):** single `CrankContext` (SDK `accord` facade + `programId`/`cranker`/`oracleQueue`/`programIdentity` + `sendIx`/`log` + reconciler-supplied `dispute`/`round`/`rpc`/`rpcSubscriptions`) and single `CrankAction` union (10 kinds: the 9 non-draw + `draw_seat`).

**Dispatch (`dispatch.ts`):** kept the `createCrankDispatch()` factory + `CrankDispatch`/`CrankHandler`; added a `registerCrank()` helper that adapts the nine `(ctx, action) => Promise<CrankResult>` executors into handlers (funnels skip-reasons into the per-crank log). draw_seat keeps `dispatch.register` (it manages its own seat-loop control flow).

**Ports:**

- 9 cranks (`request-vrf`, `finalize-round`, `finalize-dispute`, `settle-round`, `cancel-dispute`, `redraw`, `execute-update`, `execute-unpause`, `claim-refund`): each gained a 1-line `register(d)` export. Bodies unchanged.
- `draw-seat.ts`: dropped the env-reaching `getAccord`/`_accord` singleton → reads `ctx.accord`; `ctx.wallet.address`→`ctx.cranker`; `ctx.send`→`ctx.sendIx`; `ACCORD_PROGRAM_ID`→`ctx.programId`.
- `reconciler.ts`: builds the unified ctx; `stampDispute()` stamps the dispute address onto resolver-emitted actions (state.ts stays pure-over-data, its 20 test assertions untouched); `config.rpc`→`config.accord: Accord` + `oracleQueue`/`programIdentity`; `ctxLog` adapts the per-kind sink to the reconciler logger.
- `dispatch.test.ts`: rewritten for the factory (registers all 10, asserts `dispatch.has` + duplicate-registration throws + unregistered returns false).
- `reconciler.test.ts`: config helper swaps `rpc` for `accord`/`oracleQueue`/`programIdentity`; 3 action assertions updated for the stamped `dispute`.
- `package.json`: resolved to HEAD's superset (bin/start/dev scripts).

**Retired:** the static `CRANK_DISPATCH` table + `dispatchCrank()` (incoming side) and the parallel `CrankContext`/`CrankHandler` defined inline in HEAD's `dispatch.ts` (now re-exported from `types.ts`).

**Verification:** `pnpm --filter @useaccord/cranker build` (tsc --noEmit) clean; `pnpm --filter @useaccord/cranker test` 39/39 green (6 files); `pnpm --filter @useaccord/cranker lint` clean (auto-fixed 5 pre-existing prettier issues in `util.ts`); `pnpm -r run lint` full workspace clean.
