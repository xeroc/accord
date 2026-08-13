---
# accord-hnac
title: Wire ConnectorKit provider + cluster config + canon navbar
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T09:10:00Z
parent: accord-9mut
---

Port providers.tsx + navbar.tsx from apps/app; canon wordmark + registry-rows glyph; cluster selector (devnet/testnet/mainnet-beta); wallet connect/disconnect. DoD: wallet connects; cluster switches.

## Summary of Changes

- **`apps/canon/src/providers.tsx`** — ConnectorKit `AppProvider` +
  `getDefaultConfig` (appName "Canon", devnet default, 3 clusters: devnet,
  mainnet, localnet). Mirrors apps/app.
- **`apps/canon/src/shared/cluster.ts`** — `CLUSTERS`, `ClusterConfig`,
  `DEFAULT_CLUSTER_ID` (wired from VITE_ env vars).
- **`apps/canon/src/components/navbar.tsx`** — CANON wordmark + CanonLogo
  (registry-rows glyph), cluster selector (shadcn Select bound to
  `useCluster`), wallet connect/disconnect (shadcn Dialog + Button).
- **`apps/canon/src/components/ui/{button,dialog,select,sonner}.tsx`** —
  4 shadcn radix-nova UI components (copied verbatim from apps/app).
- **`apps/canon/src/main.tsx`** — React entry: StrictMode +
  QueryClientProvider + Providers + HashRouter + App + index.css import.
- **`apps/canon/src/App.tsx`** — App shell: Navbar + Routes (placeholder
  home) + Toaster. Feature routes land with canon feature beans.
- **`apps/canon/vite.config.ts`** — Vite config (react + tailwindcss plugins,
  `@` alias, `base: "./"` for GH Pages).
- **`apps/canon/index.html`** — HTML entry (favicon.svg, CANON title/meta).
- **`apps/canon/src/shared/index.ts`** — updated barrel (+ cluster exports).
- **`apps/canon/tsconfig.json`** — added `vite.config.ts` to include.
- **`apps/canon/package.json`** — build script → `tsc -b && vite build`.

### Verification

- `pnpm --filter @useaccord/canon-app run lint` — clean (tsc -b --noEmit)
- `pnpm --filter @useaccord/canon-app run build` — green (tsc + vite build → dist/)
- `pnpm --filter @useaccord/canon-app run test` — 24/24 pass
