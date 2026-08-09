---
# accord-7d4c
title: Scaffold apps/cranker/ + wallet + .env.example
status: completed
type: task
created_at: 2026-08-09T20:14:41Z
updated_at: 2026-08-09T20:14:41Z
parent: accord-rev4
---

Create the pnpm workspace package `apps/cranker/` with:

- package.json (@useaccord/cranker, type: module, bin: cranker)
- tsconfig.json extending tsconfig.base.json
- src/wallet.ts: load keypair from ACCORD_CRANKER_KEYPAIR env var, fund check
- src/send.ts: sendIx wrapper with retry logic + priority fee escalation
- .env.example: ACCORD_RPC_URL, ACCORD_WS_URL, ACCORD_CRANKER_KEYPAIR
- src/index.ts: placeholder entry point
  Uses @useaccord/sdk and @solana/kit. No crank logic yet — just the plumbing.

## Summary of Changes

Scaffolded `apps/cranker/` as a pnpm workspace package (`@useaccord/cranker`),
mirroring the evidence-daemon service layout (bun, type: module, noEmit build).

- `package.json` — `@useaccord/cranker`, `type: module`, `bin: cranker`; deps
  `@useaccord/sdk` (workspace) + `@solana/kit`; scripts: build/lint/start/dev/test.
- `tsconfig.json` — extends `../../tsconfig.base.json`, `types: ["bun"]`, `noEmit`.
- `src/wallet.ts` — `loadCrankerWallet()`: reads `ACCORD_CRANKER_KEYPAIR` path,
  validates the 64-byte keypair JSON, builds a Kit `KeyPairSigner`, probes
  balance, throws loud if under the 0.1 SOL floor (`MIN_CRANKER_FUND_LAMPORTS`).
- `src/send.ts` — `sendIx()`: builds a v0 tx with
  `setTransactionMessageComputeUnitPrice`, sends+confirms via
  `sendAndConfirmTransactionFactory`. Failure model per milestone accord-27r5 §3:
  program-logs present ⇒ `SimulationError` (skip, state moved); no logs ⇒ retry
  with fee × escalation factor up to `maxRetries`, then `SendError`.
- `src/index.ts` — placeholder entry: boots RPC + funded wallet, logs readiness,
  exits (reconciler loop is bean accord-bpag).
- `.env.example` — `ACCORD_RPC_URL`, `ACCORD_WS_URL`, `ACCORD_CRANKER_KEYPAIR`.
- `bin/cranker.js` — `#!/usr/bin/env bun` shim → `src/index.ts`.
- `eslint.config.js` / `.prettierrc.json` / `.gitignore` — copied from siblings
  so `make lint` covers the package from day one.

Verify: `pnpm run build` (tsc --noEmit) ✓ clean; `pnpm run lint` (eslint) ✓ clean.
No crank logic — plumbing only; downstream beans (accord-rnel resolver,
accord-bpag reconciler) consume `loadCrankerWallet` + `sendIx`.
