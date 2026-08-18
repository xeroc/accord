---
# accord-0851
title: Scaffold apps/synod — canon copy (vite/tailwind/shadcn/HashRouter)
status: completed
type: task
created_at: 2026-08-18T19:13:33Z
updated_at: 2026-08-18T19:13:33Z
parent: accord-5fe9
---

Copy apps/canon scaffold: Vite+React+Tailwind v4+shadcn/motion, HashRouter with GH-Pages-style base path, package @useaccord/synod-app, .env.example, workspace wiring. NO CI deploy workflow (owner decision — manual deploy). Verify: pnpm build + lint green.

## Summary of Changes

- `apps/synod/` scaffold, canon-shaped: Vite 6 + React 18 + Tailwind v4 (CSS-first tokens) + shadcn wiring (`components.json`, `cn`) + motion; package `@useaccord/synod-app`, private.
- HashRouter + `base: "./"` (portable GH-Pages-style build); NO CI deploy workflow (owner decision) — manual deploy from `dist/`.
- Entry shell: `main.tsx` (HashRouter + QueryClient), `providers.tsx` (ConnectorKit wallet, devnet default), `App.tsx` (AnimatedRoutes + Toaster) with route-growth plan for the feature beans, stub `HomePage` (SYNOD / Convene the verdict.) to be replaced by accord-hvf9.
- `.env.example` (RPCs, evidence-daemon URL for `POST /evidence/synod/:case/:slot`, Accord dApp deep-link origin), favicon (assembly glyph placeholder), `lib/utils.test.ts` keeps the `test` glob non-empty.
- Workspace wiring: picked up by the existing `apps/*` glob; `pnpm-lock.yaml` updated. README workspace map gains the `apps/synod` line.

Verify: CI trio from `tests.yml` green — `pnpm -r build` ✅, `lint` 0 errors ✅, `test` exit 0 (synod-app 3/3) ✅.
