# syntax=docker/dockerfile:1
# Evidence Operator daemon (Bun runtime). Stub — wire env injection, TLS,
# non-root user, and HEALTHCHECK when deploying (SPEC §Deployment / HA).
FROM oven/bun:1.3-debian
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
# ponytail: stub — no multi-stage, no HEALTHCHECK, runs as root for now; harden at deploy time.
CMD ["bun", "run", "src/main.ts"]
