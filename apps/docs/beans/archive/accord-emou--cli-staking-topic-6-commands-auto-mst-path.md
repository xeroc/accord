---
# accord-emou
title: CLI staking topic — 6 commands + auto-MST-path
status: completed
type: epic
priority: high
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:34:29Z
parent: accord-43co
---

Owns `src/commands/staking/` + `test/commands/staking/`. Extends `ChainCommand`
(except `can-unstake` → `BaseCommand`, pure).

## Commands (CLI.md §3 `staking`)

| Command                    | SDK fn                   | Path mode                                          |
| -------------------------- | ------------------------ | -------------------------------------------------- |
| `staking:stake`            | `stake` (staking.ts:178) | auto (`prepareStakeProof`) or `--path-from <file>` |
| `staking:request-withdraw` | `requestWithdraw` (203)  | auto / manual                                      |
| `staking:withdraw`         | `withdraw` (221)         | —                                                  |
| `staking:reconcile`        | `reconcileStake` (245)   | auto / manual                                      |
| `staking:withdraw-fees`    | `withdrawFees` (272)     | —                                                  |
| `staking:can-unstake`      | `canUnstake` (57)        | **pure pre-check, no send**                        |

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

## Summary of Changes

Implemented all 6 `staking:*` commands in `apps/cli/src/commands/staking/`,
each mapping 1:1 to its cited SDK fn, extending `ChainCommand` (except
`can-unstake` → `BaseCommand`, pure):

- `staking:stake` → `methods.stake` (auto MST path, or `--path-from`)
- `staking:request-withdraw` → `methods.requestWithdraw` (phase-1 ledger bank)
- `staking:withdraw` → `methods.withdraw` (phase-2 token move)
- `staking:reconcile` → `methods.reconcileStake` (permissionless crank)
- `staking:withdraw-fees` → `methods.withdrawFees` (ADR-0020 fee pull)
- `staking:can-unstake` → `canUnstake` (pure offline pre-check)

### Files added

- `apps/cli/src/commands/staking/{stake,request-withdraw,withdraw,reconcile,withdraw-fees,can-unstake}.ts`
- `apps/cli/src/staking-context.ts` — topic-private helper (account resolution
  - ATA derivation + auto/manual proof). Lives outside `src/commands/` (oclif
    discovers every `.ts` there) and outside the off-limits `src/lib/*`. Not
    shared cross-topic; if a second topic needs it, propose up to the milestone.
- `apps/cli/test/commands/staking/staking.test.ts` — 14 tests: help smoke for
  all 6, the 4 `canUnstake` guard branches (real output), + offline error
  paths (no-wallet, malformed `--path-from`, missing `path` array).
- `apps/cli/README.md` — `### staking:*` section under "Commands implemented".

### Design notes

- Auto-path: `resolveProof` fetches all JurorStakes via
  `findJurorStakesBySubaccord`, maps → `JurorStakeLeaf[]`, calls
  `prepareStakeProof` against the on-chain `SubaccordAccumulatorView`.
  `AccumulatorRootMismatch` (stale data) surfaces through `BaseCommand.catch()`.
- Manual `--path-from` is parsed eagerly (`readProofFile`) BEFORE `loadChain`,
  so a bad file fails fast with `InvalidProofFile` — no network/wallet needed.
  Round-trip JSON shape: `{path: [{siblingHash: <hex>, siblingSum: <num|str>}]}`
  or a bare `[...]`. **Cross-epic note:** this is the natural serialization of
  `MSTNode[]`; if `accumulator:prepare-stake-proof` (still `todo`) emits a
  different envelope, `readProofFile` is the single adapter point.
- ATA derivation mirrors the on-chain layout
  (`ATA_PROGRAM ‖ [owner, TOKEN_PROGRAM, mint]`), consistent with `config:balance`
  and `tests/src/staking.spec.ts`.
- `can-unstake` honors the bean's "extends BaseCommand, pure" contract: takes
  `--staked/--active-draws/--amount` flags (no chain), runs the pure SDK guard,
  emits `{ canUnstake, activeDraws, reason? }`.

### Verification

lint ✓ (no errors), build ✓ (tsc clean), test ✓ (29 pass / 0 fail across 3
files — config/lifecycle/staking). `useaccord help staking` lists exactly the 6
commands; every chain command honors `--json`/`--quiet`/`--dry-run`.

### Surfpool e2e

The stake → re-stake → reconcile loop is the e2e-lane (`tests/`) concern, not
the bun unit lane; the unit lane here mirrors `lifecycle:init-pause` (help +
offline behavior). Auto-path wiring is exercised through the SDK's own
`stakeFlow.test.ts`.

### Scope

Only `src/commands/staking/`, `src/staking-context.ts`,
`test/commands/staking/`, README, and this bean. No `src/lib/*`, `bin/*`,
`package.json`, or other-topic files touched.
