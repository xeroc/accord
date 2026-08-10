---
# accord-k77u
title: CLI lifecycle topic — remaining 6 commands
status: completed
type: epic
priority: normal
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T21:14:24Z
parent: accord-43co
---

Owns `src/commands/lifecycle/` + `test/commands/lifecycle/`. Extends `ChainCommand`.
Reference: the existing `init-pause.ts` in this dir. `init-pause` is DONE — do not
redo.

## Commands (CLI.md §3 `lifecycle`)

| Command                      | SDK fn                               | Notes                                                                                                                          |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `lifecycle:create-subaccord` | `createSubaccord` (lifecycle.ts:333) | Many flags (mirror `CreateSubaccordArgs`); `--random-risk-type` mints a fresh 32B risk_type. `emitCreated(subaccord, {bump})`. |
| `lifecycle:propose-update`   | `proposeSubaccordUpdate` (366)       | `--payload <Kind:value>`; print `pendingUpdate`; read `executeAfterSlot` via `getUpdateExecuteAfterSlot`.                      |
| `lifecycle:execute-update`   | `executeSubaccordUpdate` (400)       | Permissionless crank.                                                                                                          |
| `lifecycle:pause`            | `pause` (431)                        | Instant freeze.                                                                                                                |
| `lifecycle:propose-unpause`  | `proposeUnpause` (441)               | Arms `UNPAUSE_TIMELOCK_SLOTS`.                                                                                                 |
| `lifecycle:execute-unpause`  | `executeUnpause` (451)               | Permissionless, post-timelock.                                                                                                 |

## Acceptance (per command)

- One file, `static flags = { ...chainFlags, ...own }`, calls one `ctx.accord.methods.*`.
- `--dry-run`/`--json`/`--quiet` honored (inherit from base).
- Test: help smoke + `--dry-run` builds the instruction; e2e send for
  `create-subaccord` + `pause` against Surfpool (the rest are reads/cranks → dry-run).

## Gotchas

- `--authority` is NOT a flag (single-signer model: the wallet IS the authority).
- `create-subaccord` has the heaviest arg surface — validate each via the SDK's
  `assertValid*` helpers before building.

## Summary of Changes

Implemented all 6 remaining `lifecycle:*` commands, each one file extending
`ChainCommand` and calling exactly one `ctx.accord.methods.*` (init-pause was
already done and left untouched):

- `lifecycle:create-subaccord` → `methods.createSubaccord`. Full `CreateSubaccordArgs`
  flag surface; `--random-risk-type` mints a fresh 32B risk_type; `--evidence-spec`/
  `--risk-type` take 64-hex; authority hard-wired to the loaded wallet; SDK's
  `assertValid*` helpers run before build.
- `lifecycle:propose-update` → `methods.proposeSubaccordUpdate`. `--payload Kind:value`
  parsed by a type-safe switch over all 10 UpdatePayload kinds; after send, reads
  `executeAfterSlot` back via `getUpdateExecuteAfterSlot` and emits it.
- `lifecycle:execute-update` → `methods.executeSubaccordUpdate` (permissionless crank).
- `lifecycle:pause` → `methods.pause`; PauseState PDA derived via `findPauseStatePda`.
- `lifecycle:propose-unpause` → `methods.proposeUnpause`; emits `unpauseTimelockSlots`.
- `lifecycle:execute-unpause` → `methods.executeUnpause` (permissionless crank).

Tests (`test/commands/lifecycle/lifecycle.test.ts`): per-command `--help` smoke,
`--dry-run` instruction-build (deterministic, no validator needed), and behavior
assertions (zero risk_type rejected; unknown payload kind rejected). The suite
generates a valid keypair via `solana-keygen` in `beforeAll`.

README §"Commands implemented" documents all 6 new commands.

Verification (`pnpm --filter @useaccord/cli run lint && build && test`): lint
clean, build clean, 30 tests pass (15 pre-existing + 15 new). `useaccord lifecycle`
manifest lists all 7 lifecycle commands. No changes to `src/lib/*`, `bin/*`, or
`package.json` (fleet boundary respected).
