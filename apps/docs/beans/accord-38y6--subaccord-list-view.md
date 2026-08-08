---
# accord-38y6
title: Subaccord list view
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:07Z
updated_at: 2026-08-08T01:00:06Z
parent: accord-pjxh
---

Browse all subaccords via findAllSubaccords(rpc). TanStack Query useQuery. Display cards: creator, staking token, staker count, total stake. Click → navigate to /subaccords/:address. Empty state per DESIGN.md (imperative copy, no hedging). Loading state via shadcn Skeleton.

## Summary of Changes

- `SubaccordListPage` (`apps/app/src/features/subaccord/`) — TanStack Query
  `useQuery(["subaccords"])` → `findAllSubaccords(rpc)`; cards render creator,
  staking token, stakers, total stake; click → `/subaccords/:address`.
- `shared/rpc.ts` — `getRpc(cluster)` for the read path (devnet default).
- `shared/format.ts` — `shortAddress`, `formatTokenAmount` display helpers.
- `components/Skeleton.tsx` — inline shadcn-style pulse primitive (the only
  primitive the list needs; full shadcn init lands with the brand-tokens bean).
- `index.css` — brand-token CSS variables (ink/amber/border) + list/empty
  styles; IBM Plex fontsource deferred to the brand-tokens bean.
- `main.tsx` — `QueryClientProvider` wired; `App.tsx` — `/subaccords` route.
- Empty state is imperative per BRAND.md voice ("No subaccords yet." +
  "Create the first pool."); error state has retry.

Skipped: cluster selector + wallet connect (navbar/wallet bean); shadcn CLI
init (only one primitive needed for the list — add `cn`/Radix when a second
lands); e2e tests (excluded from MVP per the milestone).

Verified: `pnpm --filter @useaccord/app run typecheck` clean;
`pnpm --filter @useaccord/app run build` ✓ (237 kB js / 6.4 kB css).
