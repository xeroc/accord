# Evidence Operator daemon — container image (ADR-0011, bean accord-vx8c).
#
# Stateless: every replica is identical and derives all state from env
# (EVIDENCE_KEYRING) and the shared S3/MinIO bucket. Run N replicas behind a
# TLS-terminating load balancer; no session affinity required.
#
# ponytail: standalone `bun install --production` — the daemon has no workspace
# deps yet. When @useaccord/sdk becomes a workspace dependency, switch this to a
# workspace-aware build (copy root pnpm-workspace.yaml + lockfile, install with
# the workspace filter).

FROM oven/bun:1.3-debian AS deps
WORKDIR /app
COPY package.json ./
# Reproducible-enough for v1; no lockfile is committed for this package yet.
RUN bun install --production

FROM oven/bun:1.3-debian
WORKDIR /app

# Application code (TypeScript is run directly by Bun — no compile step).
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Non-root, no new privileges. Dedicated service user (image ships `bun`).
USER bun
WORKDIR /app

# Default plain-HTTP on 8080; TLS is terminated at the load balancer for HA.
# For end-to-end TLS, set EVIDENCE_TLS_CERT/EVIDENCE_TLS_KEY (mounted files)
# and EVIDENCE_PORT=443.
ENV EVIDENCE_PORT=8080
EXPOSE 8080

# Liveness via the /healthz probe (bean accord-u1pu): Storage + RPC reachability.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.EVIDENCE_PORT||'8080')+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/main.ts"]
