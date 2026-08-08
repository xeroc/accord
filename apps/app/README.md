# @useaccord/app

React + Vite frontend for the Accord dApp — stake as a juror, file disputes,
resolve rulings. Hosted on GitHub Pages (HashRouter, static build).

## Stack

- **Vite 6** + **React 18** (TypeScript, strict)
- **Tailwind v4** via `@tailwindcss/vite` (CSS-first config in `src/index.css`)
- **react-router-dom** with `HashRouter` (no server routing)
- Workspace package of the `accord` monorepo (see root `pnpm-workspace.yaml`)

## Commands

```bash
pnpm --filter @useaccord/app dev        # local dev server
pnpm --filter @useaccord/app build      # typecheck + static build → dist/
pnpm --filter @useaccord/app preview    # preview the production build
pnpm --filter @useaccord/app lint       # tsc --noEmit
```

## Environment

Copy `.env.example` → `.env` and set the RPC URLs:

```
VITE_DEVNET_RPC=https://api.devnet.solana.com
VITE_MAINNET_RPC=https://api.mainnet-beta.solana.com
```

All vars must be prefixed `VITE_` (Vite convention) — they're exposed to the
client, so never put secrets here.

## Structure

```
src/
  main.tsx     # entry — mounts <App/> under <HashRouter/>
  App.tsx      # route table + layout shell
  index.css    # @import "tailwindcss" (brand tokens land in accord-qv2h)
```

Routes for the three happy paths (create subaccord, stake/vote, dispute +
appeal + ruling) land with their feature beans. Wallet connection
(ConnectorKit) lands in accord-y5av; shared hooks/transaction helpers in
accord-bobu; shadcn primitives + IBM Plex fonts in accord-qv2h.

## Deploy

Static build (`dist/`) deploys to GitHub Pages. `base: "./"` in
`vite.config.ts` keeps the built `index.html` portable across user/org
project pages, and `HashRouter` means no server-side route config is needed.
