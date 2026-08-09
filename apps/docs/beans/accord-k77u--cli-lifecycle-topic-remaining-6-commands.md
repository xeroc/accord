---
# accord-k77u
title: CLI lifecycle topic — remaining 6 commands
status: todo
type: epic
priority: normal
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:20:36Z
parent: accord-43co
---

Owns `src/commands/lifecycle/` + `test/commands/lifecycle/`. Extends `ChainCommand`.
Reference: the existing `init-pause.ts` in this dir. `init-pause` is DONE — do not
redo.

## Commands (CLI.md §3 `lifecycle`)

| Command | SDK fn | Notes |
|---|---|---|
| `lifecycle:create-subaccord` | `createSubaccord` (lifecycle.ts:333) | Many flags (mirror `CreateSubaccordArgs`); `--random-risk-type` mints a fresh 32B risk_type. `emitCreated(subaccord, {bump})`. |
| `lifecycle:propose-update` | `proposeSubaccordUpdate` (366) | `--payload <Kind:value>`; print `pendingUpdate`; read `executeAfterSlot` via `getUpdateExecuteAfterSlot`. |
| `lifecycle:execute-update` | `executeSubaccordUpdate` (400) | Permissionless crank. |
| `lifecycle:pause` | `pause` (431) | Instant freeze. |
| `lifecycle:propose-unpause` | `proposeUnpause` (441) | Arms `UNPAUSE_TIMELOCK_SLOTS`. |
| `lifecycle:execute-unpause` | `executeUnpause` (451) | Permissionless, post-timelock. |

## Acceptance (per command)

- One file, `static flags = { ...chainFlags, ...own }`, calls one `ctx.accord.methods.*`.
- `--dry-run`/`--json`/`--quiet` honored (inherit from base).
- Test: help smoke + `--dry-run` builds the instruction; e2e send for
  `create-subaccord` + `pause` against Surfpool (the rest are reads/cranks → dry-run).

## Gotchas

- `--authority` is NOT a flag (single-signer model: the wallet IS the authority).
- `create-subaccord` has the heaviest arg surface — validate each via the SDK's
  `assertValid*` helpers before building.
