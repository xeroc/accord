---
# accord-xt13
title: CLI dispute topic — 4 commands (Arbitrable intake)
status: completed
type: epic
priority: high
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:25:03Z
parent: accord-43co
---

Owns `src/commands/dispute/` + `test/commands/dispute/`. `create`/`cancel` extend
`ChainCommand`; `ruling` is read-only (ChainCommand, no send); `required-fee` is
pure (`BaseCommand`).

## Commands (CLI.md §3 `dispute`)

| Command                | SDK fn                             | Notes                                                                                                                                                                          |
| ---------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dispute:create`       | `createDispute` (dispute.ts:203)   | `--options <hex,hex,..>` (2..32 × 32B), `--nonce <u64\|random>`, `--fee <lamports\|auto>` (auto ⇒ `requiredFee` from subaccord's feePerJuror). `emitCreated(dispute, {bump})`. |
| `dispute:ruling`       | `getRuling` (232)                  | **read-only**; `null` until `Final`. `emitRead`.                                                                                                                               |
| `dispute:required-fee` | `requiredFee` (113)                | **pure**; `--fee-per-juror`. Prints `{ fee }`.                                                                                                                                 |
| `dispute:cancel`       | `cancelDispute` (settlement.ts:89) | `--remaining-accounts <auto\|list>`; auto-derives Round/JurorStake/AppealBond set.                                                                                             |

## Acceptance

- `required-fee` is pure (no signer) and matches `dispute:create --fee auto`.
- `ruling` returns `null` pre-finalization, the ruling index after.
- `create` e2e against Surfpool (needs a Subaccord → coord with `lifecycle` epic).

## Cross-epic

`dispute:create` is the prerequisite for all `draw:*`/`vote:*` e2e. Land it early.

## Summary of Changes

Implemented all 4 `dispute:*` commands in `apps/cli/src/commands/dispute/`, each
backed by exactly one `@useaccord/sdk` method:

| Command                | File              | SDK fn                  | Base                     |
| ---------------------- | ----------------- | ----------------------- | ------------------------ |
| `dispute:create`       | `create.ts`       | `methods.createDispute` | ChainCommand             |
| `dispute:ruling`       | `ruling.ts`       | `methods.getRuling`     | ChainCommand (read-only) |
| `dispute:required-fee` | `required-fee.ts` | `requiredFee`           | BaseCommand (pure)       |
| `dispute:cancel`       | `cancel.ts`       | `methods.cancelDispute` | ChainCommand             |

Key behaviors:

- `required-fee` is **pure** (no signer/RPC): `3 × fee-per-juror`, errors on u64
  overflow. Matches `dispute:create --fee auto` (same SDK `requiredFee` fn).
- `ruling` returns `null` pre-finalization, the winning option index after
  (read-only, sends nothing).
- `create`: `--options <hex,hex,..>` (2..32 × 32B), `--nonce <u64|random>`
  (default random u64), `--fee <lamports|auto>` (auto ⇒ reads Subaccord
  `feePerJuror` + `requiredFee`), `--evidence <hex32>` (default zero-hash),
  `--fee-token` (override; enables offline `--dry-run`). Derives filer ATA +
  fee_vault ATA + PauseState PDA. `emitCreated(dispute, { bump, fee })`.
- `cancel`: `--remaining-accounts auto|list`. Auto derives Round + JurorStake +
  AppealBond PDAs from the Dispute's rounds (dedup, fetch-maybe filters absent
  bonds). `list` takes `--remaining <addr,..>`.

Helpers (`deriveAta`, `readSubaccordEcons`) inlined into `create.ts` + `cancel.ts`
— no shared helper file in `src/lib/` (per-topic; milestone forbids touching
shared infra, and oclif scans every file in `commands/` as a command).

Tests (`apps/cli/test/commands/dispute/`): 11 tests across 4 files.

- `required-fee.test.ts`: real-output assertions on the pure fn (human/json/quiet
  - negative-reject) — the acceptance criterion.
- `create.test.ts`: help smoke + real-output assertions on the exported pure
  parsers (`parseOptions`, `parseHash32`).
- `ruling.test.ts` + `cancel.test.ts`: help smoke covering arg + flag contract.
- Full Surfpool e2e (create → draw → vote → ruling; cancel on a stalled dispute)
  is deferred to the shared e2e suite — cross-epic soft dep on
  `lifecycle:create-subaccord` (sibling epic accord-k77u, still `todo`).

Exit gate green: `pnpm --filter @useaccord/cli run lint && build && test` →
26 pass / 0 fail. README "Commands implemented" section updated with the
`dispute:*` table + examples. `useaccord dispute --help` lists all 4 commands.
