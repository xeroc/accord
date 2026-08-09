---
# accord-fbh7
title: Accord CLI — @useaccord/cli operator framework (oclif)
status: completed
type: milestone
priority: normal
created_at: 2026-08-09T18:03:21Z
updated_at: 2026-08-09T18:04:10Z
---

Foundational oclif v4 (ESM/bun) CLI at apps/cli as @useaccord/cli. Implements the base-command + facade send pipeline and the first command: `useaccord pause_state initialize` (one-time PauseState singleton init via the @useaccord/sdk Accord facade). Loads the signer from $ANCHOR_WALLET (64-byte uint8 keypair JSON); fee payer + on-chain authority = the wallet. Verified e2e against a Surfpool with the deployed program.

## Summary of Changes

Added `@useaccord/cli` (apps/cli) — a bun/ESM oclif v4 operator CLI wired to
the `@useaccord/sdk` `Accord` facade. This is the foundational framework for
all future operator commands.

- **Scaffold:** package.json (`bin: useaccord`, `topicSeparator: " "`), tsconfig
  extending the workspace base, eslint/prettier/gitignore, README, bun test.
- **bin/run.js + bin/dev.js:** oclif `execute` ESM entry points (prod loads
  `dist/commands`, dev loads `src/commands` under bun).
- **src/lib/wallet.ts:** `loadKeypair(path)` — reads a 64-byte uint8 keypair
  JSON (`$ANCHOR_WALLET`) into a Kit `KeyPairSigner`, with clear parse errors.
- **src/lib/base-command.ts:** `BaseCommand` + shared `accordFlags`
  (`--wallet/-k`=$ANCHOR_WALLET, `--rpc/-r`=$ACCORD_RPC_URL, `--ws/-w`) and a
  reusable build→sign→send v0 pipeline (mirrors tests/src/setup/env.ts#sendIx).
- **src/commands/pause_state/initialize.ts:** `useaccord pause_state initialize`
  — calls `accord.methods.initializePause(signer.address)`, prints authority +
  PauseState PDA, sends + confirms (or `--dry-run` builds only).
- **test/commands/pause_state/initialize.test.ts:** 5 bun tests — keypair
  parsing (valid/invalid/missing) + help rendering + missing-wallet error.

Verification: `tsc` clean, `eslint` clean, `bun test` 5/5, and a confirmed
end-to-end send against a live Surfpool (PauseState account created on-chain,
owner = Accord program; second call correctly rejected by the one-time guard).

Note: the CLI runs under bun because the SDK's compiled `dist` has extensionless
internal imports that only bun resolves at runtime (matches the monorepo idiom).
