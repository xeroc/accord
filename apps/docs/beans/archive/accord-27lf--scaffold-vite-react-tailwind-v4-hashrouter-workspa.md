---
# accord-27lf
title: Scaffold Vite + React + Tailwind v4 + HashRouter workspace
status: completed
type: task
created_at: 2026-08-07T23:08:58Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-cb9q
---

Create apps/app with: Vite React TS template, Tailwind v4 (@tailwindcss/vite), react-router-dom HashRouter, pnpm workspace integration. Base TS config from tsconfig.base.json. Static build output for GitHub Pages. .env.example with VITE_DEVNET_RPC, VITE_MAINNET_RPC.

## Summary of Changes

Scaffolded `apps/app` as the `@useaccord/app` workspace package — a static
React + Vite SPA for the Accord dApp, ready for sibling beans (shadcn/fonts,
ConnectorKit provider, useAccord hook) to build on.

- `apps/app/package.json` — `@useaccord/app`, private, scripts: `dev`, `build`
  (`tsc --noEmit && vite build`), `preview`, `lint`/`typecheck` (`tsc --noEmit`),
  `clean`. Deps: react 18, react-dom 18, react-router-dom 6. Dev: Vite 6,
  @vitejs/plugin-react, Tailwind v4 (@tailwindcss/vite + tailwindcss),
  TypeScript 5.9, type defs.
- `apps/app/tsconfig.json` — extends `../../tsconfig.base.json`; `jsx: react-jsx`,
  `noEmit: true`, drops `declaration`/`declarationMap`/`sourceMap` (app, not lib),
  `types: ["vite/client", "node"]`, `isolatedModules`.
- `apps/app/vite.config.ts` — `base: "./"` (portable across user/org GitHub
  Pages), `@vitejs/plugin-react` + `@tailwindcss/vite`.
- `apps/app/index.html` — root mount, meta description, title.
- `apps/app/src/main.tsx` — mounts `<App/>` under `<HashRouter/>` in `StrictMode`.
- `apps/app/src/App.tsx` — route table (`/` + `*` stubs) with placeholder Home
  - NotFound; route comments document the full milestone route set so siblings
    can drop pages in.
- `apps/app/src/index.css` — `@import "tailwindcss"` (brand tokens deferred to
  accord-qv2h).
- `apps/app/.env.example` — `VITE_DEVNET_RPC`, `VITE_MAINNET_RPC`.
- `apps/app/.gitignore` — dist, .vite, env, node_modules.
- `apps/app/README.md` — stack, commands, structure, deploy notes.

Verified: `pnpm install` resolves; `pnpm --filter @useaccord/app run lint`
(tsc --noEmit) passes; `pnpm --filter @useaccord/app run build` produces a
static `dist/` (relative `./assets/...` paths, 31 modules, Tailwind CSS
emitted). Ready for GitHub Pages.

Scope held: shadcn + IBM Plex fonts (accord-qv2h), ConnectorKit provider +
navbar (accord-y5av), and useAccord hook + tx utils (accord-bobu) are left for
their sibling beans — this scaffold wires the router and build only.
