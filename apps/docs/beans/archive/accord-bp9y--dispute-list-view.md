---
# accord-bp9y
title: Dispute list view
status: completed
type: task
priority: normal
created_at: 2026-08-07T23:09:25Z
updated_at: 2026-08-08T00:34:24Z
parent: accord-sdtj
---

Browse all disputes via findAllDisputes (or getProgramAccounts with dispute discriminator). TanStack Query. Display: filer, subaccord, state (DisputeState enum), current round, final ruling (if Final). Click → /disputes/:address.

## Summary of Changes

### SDK: typed `getProgramAccounts` query wrapper

- `packages/sdk/src/queries.ts` — new file. Exports `findAllDisputes(rpc, config?)` which calls
  `getProgramAccounts` with the dispute discriminator memcmp filter, decodes each result via
  `parseBase64RpcAccount` + `decodeDispute`, and returns `Account<Dispute>[]`. No raw bytes leak
  to the caller. Also exports `QueryConfig` type.
- `packages/sdk/src/index.ts` — re-exports `findAllDisputes` and `QueryConfig`.

### App scaffold (minimal — full infrastructure is bean accord-27lf)

- `apps/app/` — new Vite + React + Tailwind v4 workspace package (`@useaccord/app`).
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.example`
- `src/index.css` — Tailwind v4 `@theme` with brand palette (ink, raised, border, amber, confirm,
  slash, muted, text) + IBM Plex Sans/Mono via `@fontsource`.
- `src/shared/cluster.ts` — cluster config (devnet default) + `createRpc()` factory.
- `src/shared/format.ts` — `DISPUTE_STATE_LABELS`, `formatRuling` (255 sentinel → "—"),
  `shortAddress`.

### Dispute list view

- `src/features/dispute/useDisputes.ts` — TanStack Query hook wrapping `findAllDisputes`.
- `src/features/dispute/DisputeList.tsx` — table with address, filer, subaccord, state, current
  round, final ruling. Each row links to `/disputes/:address`. Loading/error/empty states handled.
- `src/App.tsx` — HashRouter with routes (`/`, `/disputes`, `/disputes/:address`) + nav bar.
- `src/main.tsx` — React entry with `QueryClientProvider`.

### Verification

- `pnpm --filter @useaccord/sdk run lint` — green
- `pnpm --filter @useaccord/sdk run build` — green
- `pnpm --filter @useaccord/app run lint` — green
- `pnpm --filter @useaccord/app run build` — green (239 kB bundle, static output)
