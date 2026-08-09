---
# accord-52qa
title: CLI appeal topic — 3 commands
status: todo
type: epic
priority: normal
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:20:36Z
parent: accord-43co
---

Owns `src/commands/appeal/` + `test/commands/appeal/`. `open`/`claim-refund`
extend `ChainCommand`; `cost` is pure (`BaseCommand`).

## Commands (CLI.md §3 `appeal`)

| Command | SDK fn | Notes |
|---|---|---|
| `appeal:open` | `appeal` (appeal.ts:179) | `--appellant`(=signer), `--round <addr>` (prior). Auto-derives `AppealBond` for `currentRound+1`. |
| `appeal:cost` | `appealCost` (74) | **pure**; `--current-round <n>`, `--fee-per-juror`. Prints `{newRound, panel, fee, bond, total}`. |
| `appeal:claim-refund` | `claimAppealRefund` (193) | `--round-idx <n>`, `--claimant-token-account`. |

## Acceptance

- `cost` is pure and its `total` matches the bond `open` actually posts.
- `open` e2e against Surfpool (needs a finalized-able round → coord with `vote`).
- `claim-refund` pulls the bond post-resolution.

## Cross-epic

Depends on `vote:*` (a prior round must exist) for `open`/`claim-refund` e2e.
