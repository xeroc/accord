# syntax=docker/dockerfile:1
#
# Jurat — agentic juror daemon (ADR-0036) — container image.
#
# Long-running single juror identity: reconcile poll loop + WS program-log
# listener, like the cranker. No HTTP port. All config comes from env; the
# operator keypair (JURAT_KEYPAIR_PATH) is mounted at runtime, local state
# (JURAT_STATE_DIR) is a volume.
#
# This is a pnpm-workspace member that depends on @useaccord/sdk (workspace:*),
# NOT a standalone bun project. The image is built in three phases:
#   1. pnpm install the full workspace from the repo lockfile (cached layer)
#   2. build the SDK (workspace:* resolves to packages/sdk/dist) + typecheck jurat
#   3. `pnpm deploy` prunes to a self-contained dir, copied into a bun runtime
#
# Build context = repo ROOT:
#   docker build -f apps/jurat/Dockerfile .

############################
# 1. Workspace deps (cached)
############################
FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Copy EVERY workspace member's manifest: --frozen-lockfile validates the full
# graph the lockfile was generated against, so partial manifests fail it.
# Keep this list in sync with the `importers:` section of pnpm-lock.yaml.

COPY packages/sdk/package.json packages/sdk/
COPY packages/canon/package.json packages/canon/
COPY packages/synod/package.json packages/synod/
COPY packages/ui/package.json packages/ui/

COPY apps/cli/package.json apps/cli/
COPY apps/app/package.json apps/app/
COPY apps/cranker/package.json apps/cranker/
COPY apps/landing/package.json apps/landing/
COPY apps/evidence-daemon/package.json apps/evidence-daemon/
COPY apps/jurat/package.json apps/jurat/
COPY apps/canon/package.json apps/canon/
COPY apps/synod/package.json apps/synod/
COPY apps/hanse/package.json apps/hanse/
COPY apps/pitch/package.json apps/pitch/
COPY apps/remotion/package.json apps/remotion/

COPY tests/package.json tests/
RUN pnpm install --frozen-lockfile

############################
# 2. Build SDK + typecheck app
############################
FROM deps AS build
# Shared TS base config (every workspace tsconfig extends ../../tsconfig.base.json).
COPY tsconfig.base.json ./

COPY packages/sdk packages/sdk
COPY apps/jurat apps/jurat

# SDK compiles src/generated (committed) -> dist/. No anchor/IDL step needed.
# Jurat depends only on @useaccord/sdk — canon/synod are not in its graph.
RUN pnpm --filter @useaccord/sdk \
    --filter @useaccord/jurat \
    build

############################
# 3. Prune to one self-contained package
############################
FROM build AS deploy
RUN pnpm deploy --filter=@useaccord/jurat --prod /out

############################
# 4. Runtime — bun only
############################
FROM oven/bun:1-debian AS release
WORKDIR /app
ENV NODE_ENV=production
# Writable state (duties, salts, cursor, joined-subaccord book, delivery key).
# ./state would resolve to root-owned /app/state — point at a bun-owned dir.
ENV JURAT_STATE_DIR=/app/state
COPY --from=deploy /out ./
RUN mkdir -p /app/state && chown bun:bun /app/state
USER bun
# Mount the operator keypair at JURAT_KEYPAIR_PATH (read-only) and persist
# /app/state on a volume. No port: poll loop + WS listener, like the cranker.
VOLUME ["/app/state"]
ENTRYPOINT ["bun", "run", "src/main.ts"]
