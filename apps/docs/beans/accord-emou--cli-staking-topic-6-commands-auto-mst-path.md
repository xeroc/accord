---
# accord-emou
title: CLI staking topic — 6 commands + auto-MST-path
status: todo
type: epic
priority: high
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:20:36Z
parent: accord-43co
---

Owns `src/commands/staking/` + `test/commands/staking/`. Extends `ChainCommand`
(except `can-unstake` → `BaseCommand`, pure).

## Commands (CLI.md §3 `staking`)

| Command | SDK fn | Path mode |
|---|---|---|
| `staking:stake` | `stake` (staking.ts:178) | auto (`prepareStakeProof`) or `--path-from <file>` |
| `staking:request-withdraw` | `requestWithdraw` (203) | auto / manual |
| `staking:withdraw` | `withdraw` (221) | — |
| `staking:reconcile` | `reconcileStake` (245) | auto / manual |
| `staking:withdraw-fees` | `withdrawFees` (272) | — |
| `staking:can-unstake` | `canUnstake` (57) | **pure pre-check, no send** |

Common flags: `--subaccord`, `--juror` (default = signer), `--amount`,
`--pause-state` (auto-derives singleton).

## Auto-path mode (the interesting part)

CLI fetches the Subaccord + all `JurorStake`s (`findJurorStakesBySubaccord`),
calls `prepareStakeProof(subaccord, stakes, juror)`, verifies the root matches
on-chain, throws `AccumulatorRootMismatch` on stale data with a retry hint.
`--path-from <file>` escapes to manual (offline/advanced).

## Acceptance

- Auto-path works end-to-end for `stake` against Surfpool (stake → re-stake →
  reconcile).
- `can-unstake` is pure: prints `{ canUnstake, activeDraws, reason }`, no send.
- `--path-from` round-trips with `accumulator:prepare-stake-proof` output.

## Cross-epic

Depends on `accumulator` epic for the proof JSON shape (coordinate the schema).
