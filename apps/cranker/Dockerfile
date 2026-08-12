# syntax=docker/dockerfile:1
#
# Accord Cranker — container image.
#
# This is a pnpm-workspace member that depends on @useaccord/sdk (workspace:*),
# NOT a standalone bun project. The image is built in three phases:
#   1. pnpm install the full workspace from the repo lockfile (cached layer)
#   2. build the SDK (workspace:* resolves to packages/sdk/dist) + typecheck cranker
#   3. `pnpm deploy` prunes to a self-contained dir, copied into a bun runtime
#
# Build context = repo ROOT:
#   docker build -f apps/cranker/Dockerfile .

############################
# 1. Workspace deps (cached)
############################
FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Copy EVERY workspace member's manifest: --frozen-lockfile validates the full
# graph the lockfile was generated against, so partial manifests fail it.
COPY packages/sdk/package.json packages/sdk/
COPY packages/canon/package.json packages/canon/
COPY apps/cli/package.json apps/cli/
COPY apps/app/package.json apps/app/
COPY apps/cranker/package.json apps/cranker/
COPY apps/landing/package.json apps/landing/
COPY apps/evidence-daemon/package.json apps/evidence-daemon/
COPY tests/package.json tests/
RUN pnpm install --frozen-lockfile

############################
# 2. Build SDK + typecheck app
############################
FROM deps AS build
# Shared TS base config (every workspace tsconfig extends ../../tsconfig.base.json).
COPY tsconfig.base.json ./
COPY packages/sdk packages/sdk
COPY apps/cranker apps/cranker
# SDK compiles src/generated (committed) -> dist/. No anchor/IDL step needed.
RUN pnpm --filter @useaccord/sdk build
# cranker build is `tsc --noEmit` (typecheck only; bun runs .ts directly).
RUN pnpm --filter @useaccord/cranker build

############################
# 3. Prune to one self-contained package
############################
FROM build AS deploy
RUN pnpm deploy --filter=@useaccord/cranker --prod /out

############################
# 4. Runtime — bun only
############################
FROM oven/bun:1-debian AS release
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deploy /out ./
USER bun
# No port: the cranker is a 60s reconciler poll loop + WS program-log listener.
ENTRYPOINT ["bun", "run", "src/index.ts"]
