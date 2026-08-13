---
# accord-ajps
title: List browser — getProgramAccounts scan + cards + featured slot
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T03:30:00Z
parent: accord-pzhs
---

Scan CanonList accounts → cards (mints, item_count, authority, rules_hash). Reserved featured slot (VITE_FEATURED_LIST, empty → hidden). Pagination (cap + load more). DoD: lists render from live chain; empty/loading/error states. see milestone §1(d),§10.

## Summary of Changes

Scaffolded `apps/canon` (`@useaccord/canon-app`) — a full Vite + React + Tailwind v4 +
HashRouter + ConnectorKit dApp mirroring `apps/app` stack-for-stack (the scaffold epic
accord-9mut had not yet run; apps/canon did not exist). Built the ListBrowser feature
within it.

### ListBrowser (accord-ajps core deliverable)

- `src/features/list/ListBrowser.tsx` — scans the Canon program via typed
  `findAllCanonLists(rpc)` (discriminator-filtered GPA). Cards show stake mint, fee
  mint, item count, deposit, authority, and rules hash. Links to `/lists/:address`.
- Featured slot: `VITE_FEATURED_LIST` env → fetches a specific CanonList via
  `fetchCanonListRaw`, renders it prominently above the grid (amber border). Empty/
  absent → hidden. Featured list is deduplicated from the main grid.
- Client-side pagination: PAGE_SIZE=12 cap + "Load more" button. Resets on RPC change.
- Empty/loading/error states (BRAND.md voice — imperative, no hedging).

### Supporting infrastructure (apps/canon scaffold)

- `shared/rpc.ts` — `useClusterRpc()` (read-only RPC), `findAllCanonLists(rpc)`
  (typed GPA wrapper mirroring Accord SDK's `findAllSubaccords`), `fetchCanonListRaw()`
  (single-account read via raw RPC + SDK decoder).
- `shared/format.ts`, `shared/cluster.ts`, `shared/index.ts` — display helpers,
  cluster config, barrel (mirrors apps/app).
- `components/navbar.tsx` — CANON wordmark + registry-rows glyph logo, cluster
  selector, wallet connect (ConnectorKit + shadcn).
- `components/Copyable.tsx`, `Skeleton.tsx`, `ui/{button,dialog,select,sonner}.tsx` —
  UI primitives (copied from apps/app).
- `index.css` — full dark-first design system (copied from apps/app) + featured slot
  - pagination CSS.
- `providers.tsx`, `main.tsx`, `App.tsx`, `vite.config.ts`, `tsconfig.json`,
  `package.json`, `components.json`, `index.html`, `.env.example`, `.gitignore`.

### Verification

- `apps/canon` lint (tsc --noEmit): clean.
- `apps/canon` build (tsc + vite build): green (753 KB bundle, fonts bundled).
- Workspace-wide lint: all 6 apps clean.
- Workspace-wide build: all packages + apps green.
