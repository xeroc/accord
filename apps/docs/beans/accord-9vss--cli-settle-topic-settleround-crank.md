---
# accord-9vss
title: CLI settle topic — settle:round crank
status: completed
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

| Command        | SDK fn                           | Notes                                                                               |
| -------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
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

## Summary of Changes

Implemented `useaccord settle:round` — the permissionless per-round settlement
crank (`methods.settleRound`, lib.rs:1555). One command, extends `ChainCommand`.

### Files

- `apps/cli/src/commands/settle/round.ts` — `settle:round` command.
- `apps/cli/test/commands/settle/round.test.ts` — help smoke + required-flag
  error + offline `--dry-run` instruction-build (list mode).
- `apps/cli/README.md` — `settle:round` documented under "Commands implemented".

### Design

- Flags: `--subaccord`, `--dispute`, `--round-idx` (required); `--round`
  (optional override; else derived via `findRoundPda({dispute, roundIdx})`);
  `--remaining-accounts auto|list` (default `auto`); `--juror-stake <pda>...`
  (required with `list`).
- `--remaining-accounts auto` fetches the Round account, takes the first
  `jurorCount` of `round.jurors`, and derives each seat's `JurorStake` PDA
  (`["stake", subaccord, juror]`) — matching the on-chain remaining_accounts
  contract (lib.rs:1574, `len == juror_count`).
- Sends via `sendInstruction` → `emitSend` with `{round, roundIdx, panel}`;
  `--dry-run` → `emitDryRun`.

### Verification

- `pnpm --filter @useaccord/cli run lint` → clean.
- `pnpm --filter @useaccord/cli run build` → clean.
- `pnpm --filter @useaccord/cli run test` → 18 pass, 0 fail. Dry-run output
  confirms the settle_round discriminator + accounts incl. the panel PDAs.

### Deferred (per milestone contract)

- The `--remaining-accounts auto` panel derivation is inlined (marked
  `ponytail:`). When `vote:finalize-round` (accord-ouph) lands, propose
  promoting it to `src/lib/panel.ts` — same JurorStake-PDA derivation, shared
  by both cranks.
- e2e settle against a Final dispute (pairs with `staking:withdraw-fees`) runs
  in the cross-topic e2e harness, not this standalone unit test (needs the full
  create→draw→vote→appeal→finalize chain).
