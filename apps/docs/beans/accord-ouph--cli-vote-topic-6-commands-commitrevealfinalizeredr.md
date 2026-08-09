---
# accord-ouph
title: CLI vote topic — 6 commands (commit/reveal/finalize/redraw)
status: completed
type: epic
priority: high
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:33:03Z
parent: accord-43co
---

Owns `src/commands/vote/` + `test/commands/vote/`. `commit-hash` is pure
(`BaseCommand`); the rest extend `ChainCommand`.

## Commands (CLI.md §3 `vote`)

| Command                 | SDK fn                   | Notes                                                                                                                       |
| ----------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `vote:commit`           | `commit` (voting.ts:194) | `--juror`(=signer), `--vote <n>`, `--salt <hex\|random>`. Prints `{commitment}`.                                            |
| `vote:reveal`           | `reveal` (219)           | Same `--vote`/`--salt` as commit (must match). Adds `--staking-token`, `--juror-token-account`, `--vault` (auto-derivable). |
| `vote:finalize-round`   | `finalizeRound` (254)    | `--remaining-accounts <auto\|list>` (panel JurorStake PDAs).                                                                |
| `vote:finalize-dispute` | `finalizeDispute` (273)  | `--remaining-accounts <auto\|list>` (panel + AppealBonds).                                                                  |
| `vote:redraw`           | `redraw` (318)           | ADR-0021 shortfall. `--fee-token`, `--filer-token-account`, `--fee-vault`.                                                  |
| `vote:commit-hash`      | `commitHash` (77)        | **pure**; `--vote --salt --juror`.                                                                                          |

## Acceptance

- `commit-hash` is pure and matches the on-chain `hashv` (cross-check vs `commit`).
- `commit`→`reveal` round-trip e2e (needs a drawn panel → coord with `draw`).
- `--salt random` on commit must be re-suppliable to reveal (print it; support
  `--salt-from`).

## Cross-epic

Needs `draw:*` panel populated before reveal/finalize e2e.

## Summary of Changes

Implemented all 6 `vote:*` commands in `apps/cli/src/commands/vote/`:

- **`vote:commit-hash`** (`commit-hash.ts`) — pure `BaseCommand`; computes
  `sha256(vote ‖ salt ‖ juror)` via the SDK `commitHash`. Exports the shared
  `decodeHexSalt`/`toHex` helpers reused by the chain commands.
- **`vote:commit`** (`commit.ts`) — `ChainCommand`; derives the round PDA,
  computes + sends the commit. `--salt random` generates a fresh 32-byte salt
  and echoes it back (hex); `--salt-from <path>` reads a saved salt. Exports
  `resolveSalt` (hex|random|file) reused by `reveal`.
- **`vote:reveal`** (`reveal.ts`) — `ChainCommand`; same salt resolution as
  commit, adds `--staking-token`/`--juror-token-account`/`--vault`. `--vault`
  auto-derives the subaccord ATA when omitted. Exports `deriveAta`.
- **`vote:finalize-round`** (`finalize-round.ts`) — `ChainCommand`;
  `--remaining-accounts auto|list`. Auto fetches the round, derives the panel's
  JurorStake PDAs. Exports `resolveRemaining`/`resolvePanelJurorStakes`/
  `splitAddressList`.
- **`vote:finalize-dispute`** (`finalize-dispute.ts`) — `ChainCommand`;
  `--remaining-accounts auto|list`. Auto derives panel JurorStakes +
  AppealBonds (roundIdx `0..current_round`, per on-chain `finalize_dispute`).
- **`vote:redraw`** (`redraw.ts`) — `ChainCommand`; ADR-0021 shortfall crank.
  Calls the pure `redraw` fn via `ctx.accord.adapter` (not bound on
  `Accord.methods`). `--fee-vault` auto-derives; `tokenProgram` pinned to SPL.

Tests (`test/commands/vote/vote.test.ts`): help smoke for all 6 + the pure
`commit-hash` cross-checked against the known SDK vector
(`c70c38e6…392e`), + invalid-salt rejection. 23 pass / 0 fail.

Verification: `pnpm --filter @useaccord/cli run lint && build && test` green.

### Notes / deferred

- `vote:redraw` invokes the pure `redraw` orchestration fn through
  `accord.adapter` because it is not bound on `AccordMethods` (methods.ts).
  Binding it there is a one-line SDK change proposed back to the milestone
  owner if the fleet wants `accord.methods.redraw` symmetry.
- e2e commit→reveal round-trip deferred to the draw topic (needs a drawn
  panel); the unit/dry-run path is covered here.
