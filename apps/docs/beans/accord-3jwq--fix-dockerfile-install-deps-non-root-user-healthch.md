---
# accord-3jwq
title: 'Fix Dockerfile: install deps, non-root user, HEALTHCHECK'
status: completed
type: task
priority: high
created_at: 2026-08-06T20:29:21Z
updated_at: 2026-08-06T22:55:57Z
parent: accord-s3ow
---

---

assigned: implementer

---

## Problem (REVIEW item 9)

`apps/evidence-daemon/Dockerfile` copies `package.json` + `src/` but **never runs `bun install`**. The image builds, the container starts, and immediately exits — no `node_modules`, nothing listening. The daemon is a "deployable empty process."

Current Dockerfile (9 lines):

```dockerfile
FROM oven/bun:1.3-debian
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
CMD ["bun", "run", "src/main.ts"]
```

## Fix

```dockerfile
FROM oven/bun:1.3-debian
WORKDIR /app
COPY package.json bun.lockb tsconfig.json ./
RUN bun install --frozen-lockfile --production
COPY src ./src
USER bun
# HEALTHCHECK: probe /healthz every 30s (Bun fetch against EVIDENCE_PORT; TLS in prod).
CMD ["bun", "run", "src/main.ts"]
```

Notes:

- `bun.lockb` must exist at repo root for `apps/evidence-daemon` (workspace lockfile) — verify the lockfile path before copying; if it's a root workspace lock, copy from there.
- `--production` skips devDependencies (eslint, prettier, typescript, @types/*) — the runtime only needs `@accord/sdk`, `@aws-sdk/client-s3`, `@noble/curves`, `@solana/kit`, `bs58`.
- `USER bun` — the `oven/bun` image ships a non-root `bun` user; run as it.
- `HEALTHCHECK` probes `/healthz` (the route the SPEC mandates — S3 + RPC reachability).

## Verify

```bash
docker build -t evidence-daemon:test apps/evidence-daemon
# then run with the full EVIDENCE_* env (RPC URL, program id, keyring, S3, port).
# container stays up; /healthz responds (503 until deps reachable, not crash).
```

Depends on: main.ts actually wiring the server (so the container has something to run).

See milestone accord-yjno HANDOFF §2 (data contract) for the env var list.

## Audit (marked completed)

Verified already-implemented against the bean's "Fix": multi-stage build with
`bun install --production`, `USER bun`, `HEALTHCHECK` probing `/healthz`,
`EXPOSE 8080`/`ENV EVIDENCE_PORT`. One documented deviation (no
`--frozen-lockfile`: no lockfile committed for this package yet). No code
changes this session — status set to completed after audit.
