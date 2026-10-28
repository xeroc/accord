---
# accord-a8a9
title: Jurat docker image (Dockerfile + Release CI job)
status: completed
type: task
priority: normal
created_at: 2026-10-27T12:25:02Z
updated_at: 2026-10-27T12:40:50Z
---

- [x] apps/jurat/Dockerfile modeled on cranker/evidence-daemon (workspace pnpm + bun runtime, writable JURAT_STATE_DIR)
- [x] Restore full lockfile-importer manifest coverage in cranker/evidence-daemon Dockerfiles (missing ui/canon/synod/hanse/pitch/remotion/jurat broke --frozen-lockfile)
- [x] build-jurat-docker job in .github/workflows/release.yml
- [x] .dockerignore: jurat context rules
- [x] changeset
- [x] docker build jurat image green + container smoke (module graph imports)

## Summary of Changes

- `apps/jurat/Dockerfile`: workspace pnpm deps → sdk+jurat build → `pnpm deploy` → bun runtime; bun-owned `/app/state` (VOLUME, `JURAT_STATE_DIR`), no port (poll loop + WS).
- cranker/evidence-daemon Dockerfiles: full 16-importer manifest list restored (ui/canon/synod/hanse/pitch/remotion/jurat were missing → frozen-lockfile failed).
- `release.yml`: `build-jurat-docker` job → `ghcr.io/xeroc/useaccord-jurat`; `.dockerignore`: jurat in root-context builds, manifest-only members' sources excluded; jurat SPEC scope updated; changeset added.
- Verified: `docker build -f apps/jurat/Dockerfile .` green; container smoke — module graph imports, `/app/state` writable as bun, full boot with fake env (delivery key persisted, RPC-down handled by retry).
