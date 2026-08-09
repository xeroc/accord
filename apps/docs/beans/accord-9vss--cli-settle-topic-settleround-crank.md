---
# accord-9vss
title: CLI settle topic — settle:round crank
status: todo
type: epic
priority: normal
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:20:36Z
parent: accord-43co
---

Owns `src/commands/settle/` + `test/commands/settle/`. Extends `ChainCommand`.

## Command (CLI.md §3 `settle`)

| Command | SDK fn | Notes |
|---|---|---|
| `settle:round` | `settleRound` (settlement.ts:66) | `--round-idx <n>`, `--remaining-accounts <auto\|list>`. Per-round settlement crank. |

## Acceptance

- Permissionless crank: `--remaining-accounts auto` derives the panel
  JurorStake/Round set from the dispute.
- e2e: settle a resolved round against Surfpool and confirm `fees_earned` credits
  (pairs with `staking:withdraw-fees`).

## Notes

Small epic (one command) but it closes the fee-redistribution loop — coordinate
the `--remaining-accounts` auto-derivation with `vote:finalize-round` (same panel
set) so the derivation helper is shared, not duplicated.
