---
# accord-86my
title: CI/deploy — GH Pages (HashRouter base path)
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T04:53:00Z
parent: accord-5t0a
---

GH Pages workflow mirroring apps/app; HashRouter (no server routing); base path config. DoD: app deploys + routes resolve under the pages path.

## Summary of Changes

Added the GH Pages deploy plumbing for the Canon dApp, mirroring the
`apps/app` static-hosting contract (HashRouter + vite `base: "./"`) and the
existing `landing-page.yaml` deploy pattern.

- **`.github/workflows/canon-app.yaml`** (new) — reusable workflow
  (`workflow_call` + `workflow_dispatch`) that builds `apps/canon` and deploys
  its `dist/` to the shared `gh-pages` branch under `canon/`
  (`destination_dir: canon`, `keep_files: true`), gated on `main`. Served at
  `<pages-host>/canon/` → hash routes resolve as `/canon/#/lists/:addr`.
  - **`app-exists` guard:** `apps/canon` is scaffolded by a separate bean
    (E1) that hasn't landed yet. Until it does, the job skips cleanly so the
    pipeline stays green; it auto-activates the moment the directory appears.
  - Wires the canon env vars (`VITE_RPC_URL`, `VITE_EVIDENCE_DAEMON_URL`,
    `VITE_ACCORD_APP_URL`, `VITE_FEATURED_LIST`) via `VITE_CANON_*` secrets;
    absent secrets resolve to empty strings and the app falls back to defaults
    (mirrors apps/app).
- **`.github/workflows/main.yaml`** — added a `canon-app` job that calls the
  new workflow (`if: always()`, `secrets: inherit`), alongside `landingpage`.
- **`.github/workflows/landing-page.yaml`** — added `keep_files: true` to the
  landing deploy so the two apps coexist on the single `gh-pages` branch
  (landing at root with its cname, canon under `/canon/`). Required for canon's
  deploy to survive subsequent landing deploys.

**Routing/base-path contract** (`HashRouter` in `main.tsx` + `base: "./"` in
`vite.config.ts`) lives in the app itself — the E1 scaffold bean's job, already
mandated by the milestone §2/§10. The CI workflow documents this contract in
its header comment. No app code was added by this bean (apps/canon does not
exist yet by design — see the guard above).

### Verification

- All three workflow files parse as valid YAML.
- `pnpm run -r --filter "./packages/*" --filter "./apps/*" build` → green.
- `pnpm run -r --filter "./packages/*" --filter "./apps/*" lint` → green.

### Notes / follow-ups

- Runtime deploy cannot be exercised until E1 scaffolds `apps/canon`; the
  `app-exists` guard makes the workflow a no-op until then.
- The `VITE_CANON_*` repo secrets should be provisioned before first real
  deploy (the app falls back to safe defaults if absent).
