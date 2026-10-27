---
"@useaccord/jurat": patch
"@useaccord/cranker": patch
"@useaccord/evidence-daemon": patch
---

Docker images (bean accord-a8a9):

- New `apps/jurat/Dockerfile` — jurat juror-daemon image (same workspace pnpm
  + `pnpm deploy` + bun-runtime pattern as the cranker), built and pushed by
  the Release workflow as `ghcr.io/xeroc/useaccord-jurat`.
- Cranker/evidence-daemon Dockerfiles: copy EVERY lockfile importer's
  manifest again — `packages/ui`, `apps/{canon,synod,hanse,pitch,remotion,jurat}`
  were missing, so `pnpm install --frozen-lockfile` failed at the deps stage.
- `.dockerignore`: jurat added to the root-context builds; manifest-only
  members' sources excluded from the context.
