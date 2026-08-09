---
# accord-xt13
title: CLI dispute topic — 4 commands (Arbitrable intake)
status: todo
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

| Command | SDK fn | Notes |
|---|---|---|
| `dispute:create` | `createDispute` (dispute.ts:203) | `--options <hex,hex,..>` (2..32 × 32B), `--nonce <u64\|random>`, `--fee <lamports\|auto>` (auto ⇒ `requiredFee` from subaccord's feePerJuror). `emitCreated(dispute, {bump})`. |
| `dispute:ruling` | `getRuling` (232) | **read-only**; `null` until `Final`. `emitRead`. |
| `dispute:required-fee` | `requiredFee` (113) | **pure**; `--fee-per-juror`. Prints `{ fee }`. |
| `dispute:cancel` | `cancelDispute` (settlement.ts:89) | `--remaining-accounts <auto\|list>`; auto-derives Round/JurorStake/AppealBond set. |

## Acceptance

- `required-fee` is pure (no signer) and matches `dispute:create --fee auto`.
- `ruling` returns `null` pre-finalization, the ruling index after.
- `create` e2e against Surfpool (needs a Subaccord → coord with `lifecycle` epic).

## Cross-epic

`dispute:create` is the prerequisite for all `draw:*`/`vote:*` e2e. Land it early.
