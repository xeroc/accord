---
# accord-hbg8
title: Juror management frontend — /juror dashboard + /juror/stake route + stake/requestWithdraw/withdraw/reconcile/withdrawFees actions
status: completed
type: task
priority: high
created_at: 2026-08-08T23:50:54Z
updated_at: 2026-08-09T00:01:10Z
---

The /juror/stake link from SubaccordDetailPage is dangling (404). Create features/juror/ with: (1) /juror dashboard listing all my JurorStakes via findJurorStakesByJuror; (2) /juror/stake route with stake form + per-stake management actions (stake more, requestWithdraw, withdraw, reconcile, withdrawFees). Wire MST proof via prepareStakeProof. Mirror existing dispute/subaccord feature patterns.

## Summary of Changes

### New routes

- `/juror` — Juror dashboard: lists every JurorStake for the connected wallet (`findJurorStakesByJuror`), with totals (staked / active draws / fees earned) and per-stake cards deep-linking to `/juror/stake?subaccord=…`.
- `/juror/stake` — Stake + manage page (was a dangling 404 link from SubaccordDetailPage). Two modes: initial stake form (new juror) or the full StakeActions panel (existing juror).

### `features/juror/` directory (mirrors dispute/subaccord patterns)

- `JurorDashboardPage.tsx` — the `/juror` route.
- `StakePage.tsx` — the `/juror/stake` route: subaccord selector, terms summary, initial-stake form or StakeActions.
- `StakeActions.tsx` — per-stake management panel exposing all five juror actions: **stake more**, **request withdraw** (phase 1), **withdraw** (phase 2), **reconcile** (fold settlement delta), **withdraw fees** (ADR-0020, no gate). Each action is an inline form; proof-needing actions share one `useStakingProof` result.
- `useJurorStakes.ts` — `useJurorStakes(juror)` (dashboard) + `useJurorStake(subaccord, juror)` (single).
- `useStakingProof.ts` — builds the MST accumulator proof via `prepareStakeProof` for stake/requestWithdraw/reconcile.

### SDK gap fixed

- `packages/sdk/src/index.ts` — added `type JurorStake`, `type PauseState`, `type PendingUpdate` to the public re-export list (only the decoders/fetchers were exported before; the types were missing).

### Wiring

- `App.tsx` — two new routes.
- `HomePage.tsx` — juror dashboard card at the top of the options grid.
- `SubaccordDetailPage.tsx` — its existing `/juror/stake?subaccord=…` link now resolves.

### Build status

`pnpm --filter @useaccord/app build` green. `pnpm --filter @useaccord/sdk build` green. No new deps.
