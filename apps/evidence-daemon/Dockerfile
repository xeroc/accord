# syntax=docker/dockerfile:1
#
# Evidence Operator daemon — container image (ADR-0011, bean accord-vx8c).
#
# Stateless: every replica is identical and derives all state from env
# (EVIDENCE_KEYRING) and the shared S3/MinIO bucket. Run N replicas behind a
# TLS-terminating load balancer; no session affinity required.
#
# This is a pnpm-workspace member that depends on @useaccord/sdk (workspace:*),
# NOT a standalone bun project. The image is built in three phases:
#   1. pnpm install the full workspace from the repo lockfile (cached layer)
#   2. build the SDK (workspace:* resolves to packages/sdk/dist) + typecheck daemon
#   3. `pnpm deploy` prunes to a self-contained dir, copied into a bun runtime
#
# Build context = repo ROOT:
#   docker build -f apps/evidence-daemon/Dockerfile .

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
COPY packages/synod/package.json package/synod/

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
COPY packages/canon packages/canon
COPY packages/synod packages/synod

COPY apps/evidence-daemon apps/evidence-daemon

# SDK compiles src/generated (committed) -> dist/. No anchor/IDL step needed.
RUN pnpm --filter @useaccord/sdk  \
  --filter @useaccord/canon \
  --filter @useaccord/synod build && \
  pnpm --filter @useaccord/evidence-daemon build

############################
# 3. Prune to one self-contained package
############################
FROM build AS deploy
RUN pnpm deploy --filter=@useaccord/evidence-daemon --prod /out

############################
# 4. Runtime — bun only
############################
FROM oven/bun:1-debian AS release
WORKDIR /app
ENV NODE_ENV=production
# Default plain-HTTP on 8080; TLS is terminated at the load balancer for HA.
# For end-to-end TLS, set EVIDENCE_TLS_CERT/EVIDENCE_TLS_KEY (mounted files)
# and EVIDENCE_PORT=443.
ENV EVIDENCE_PORT=8080
COPY --from=deploy /out ./
USER bun
EXPOSE 8080
# Liveness via the /healthz probe (bean accord-u1pu): Storage + RPC reachability.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.EVIDENCE_PORT||'8080')+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "src/main.ts"]
