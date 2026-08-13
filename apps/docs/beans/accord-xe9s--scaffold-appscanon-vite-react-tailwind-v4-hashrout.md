---
# accord-xe9s
title: Scaffold apps/canon — Vite + React + Tailwind v4 + HashRouter workspace
status: completed
type: task
created_at: 2026-08-13T02:08:00Z
updated_at: 2026-08-13T09:20:00Z
parent: accord-9mut
---

New @useaccord/canon-app workspace mirroring apps/app (package.json, vite.config, tsconfig.base, index.html, HashRouter). DoD: `pnpm --filter @useaccord/canon-app run build` succeeds on a blank App. see milestone §2.

## Summary of Changes

The full Vite + React + Tailwind v4 + HashRouter scaffold was delivered across
the three sibling beans (all completed in this worktree):

- **accord-3sw6** — package.json + tsconfig.json + .gitignore + vite-env.d.ts +
  shared/ utilities (rpc, fetch, format, cluster, index).
- **accord-ejoz** — index.css (Tailwind v4 + brand tokens) + components.json
  (shadcn) + favicon.svg + CanonLogo.tsx + lib/utils.ts + .env.example.
- **accord-hnac** — providers.tsx (ConnectorKit) + navbar.tsx (CanonLogo +
  wallet) + main.tsx + App.tsx + vite.config.ts + index.html + 4 shadcn UI
  components + cluster.ts.

DoD met: `pnpm --filter @useaccord/canon-app run build` succeeds (tsc -b &&
vite build → dist/). No additional code changes needed for this bean — the
parallel siblings delivered the scaffold collaboratively.
