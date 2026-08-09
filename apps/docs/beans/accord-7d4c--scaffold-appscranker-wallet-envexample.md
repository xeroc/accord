---
# accord-7d4c
title: Scaffold apps/cranker/ + wallet + .env.example
status: todo
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
