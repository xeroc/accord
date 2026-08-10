---
# accord-52qa
title: CLI appeal topic — 3 commands
status: completed
type: epic
priority: normal
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:31:58Z
parent: accord-43co
---

Owns `src/commands/appeal/` + `test/commands/appeal/`. `open`/`claim-refund`
extend `ChainCommand`; `cost` is pure (`BaseCommand`).

## Commands (CLI.md §3 `appeal`)

| Command               | SDK fn                    | Notes                                                                                             |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| `appeal:open`         | `appeal` (appeal.ts:179)  | `--appellant`(=signer), `--round <addr>` (prior). Auto-derives `AppealBond` for `currentRound+1`. |
| `appeal:cost`         | `appealCost` (74)         | **pure**; `--current-round <n>`, `--fee-per-juror`. Prints `{newRound, panel, fee, bond, total}`. |
| `appeal:claim-refund` | `claimAppealRefund` (193) | `--round-idx <n>`, `--claimant-token-account`.                                                    |

## Acceptance

- `cost` is pure and its `total` matches the bond `open` actually posts.
- `open` e2e against Surfpool (needs a finalized-able round → coord with `vote`).
- `claim-refund` pulls the bond post-resolution.

## Cross-epic

Depends on `vote:*` (a prior round must exist) for `open`/`claim-refund` e2e.

## Summary of Changes

Implemented all three `appeal:*` commands in `apps/cli/src/commands/appeal/` +
`apps/cli/test/commands/appeal/` (10 tests, all green):

- `appeal:cost` (`cost.ts`) — **pure** (`BaseCommand`); `--current-round`,
  `--fee-per-juror`. Calls the SDK pure helper `appealCost`. Emits
  `{newRound, panel, fee, bond, total}`. `total` matches what `appeal:open`
  transfers (fee_new + equal bond). Real-output test asserts the round-0→1
  panel-7 math (total = 14·fpj).
- `appeal:open` (`open.ts`) — `ChainCommand`; `--dispute` (required),
  `--appellant` (= wallet). Fetches the dispute → Subaccord, derives pauseState,
  prior round, AppealBond, both `feeToken` ATAs; one `methods.appeal` call.
- `appeal:claim-refund` (`claim-refund.ts`) — `ChainCommand`; `--dispute`,
  `--round-idx` (required), `--claimant-token-account` (= wallet ATA). Derives
  AppealBond + feeVault; one `methods.claimAppealRefund` call.

`open`/`claim-refund` carry help-smoke + required-flag + no-wallet tests
(mirroring `lifecycle/init-pause`). A full Surfpool e2e send needs a resolved
prior round (the `vote:*` topic); the on-chain `appeal` path is already
covered green in `tests/src/appeal.spec.ts`.

### Reality fix (code trusted over stale doc)

The bean + the SDK `methods/appeal.ts` docstring both say the AppealBond PDA is
keyed by `currentRound + 1`. The on-chain code (lib.rs:3361) seeds it with
`dispute.current_round` (the round **being** appealed, before the increment),
and the green e2e (`tests/src/appeal.spec.ts:508`) derives it with
`roundIdx: 0` when currentRound is 0. `appeal:open` derives the bond with the
prior round idx to match reality. The stale SDK docstring lives outside this
topic's dir (fleet boundary) so it was left for a follow-up.

### Verification

`pnpm --filter @useaccord/cli run lint && build && test` → 25 pass / 0 fail.
README §"Commands implemented" gains an `appeal:*` block; `appeal:*` removed
from the "remaining" list.
