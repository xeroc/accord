---
# accord-ouph
title: CLI vote topic — 6 commands (commit/reveal/finalize/redraw)
status: todo
type: epic
priority: high
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:20:36Z
parent: accord-43co
---

Owns `src/commands/vote/` + `test/commands/vote/`. `commit-hash` is pure
(`BaseCommand`); the rest extend `ChainCommand`.

## Commands (CLI.md §3 `vote`)

| Command | SDK fn | Notes |
|---|---|---|
| `vote:commit` | `commit` (voting.ts:194) | `--juror`(=signer), `--vote <n>`, `--salt <hex\|random>`. Prints `{commitment}`. |
| `vote:reveal` | `reveal` (219) | Same `--vote`/`--salt` as commit (must match). Adds `--staking-token`, `--juror-token-account`, `--vault` (auto-derivable). |
| `vote:finalize-round` | `finalizeRound` (254) | `--remaining-accounts <auto\|list>` (panel JurorStake PDAs). |
| `vote:finalize-dispute` | `finalizeDispute` (273) | `--remaining-accounts <auto\|list>` (panel + AppealBonds). |
| `vote:redraw` | `redraw` (318) | ADR-0021 shortfall. `--fee-token`, `--filer-token-account`, `--fee-vault`. |
| `vote:commit-hash` | `commitHash` (77) | **pure**; `--vote --salt --juror`. |

## Acceptance

- `commit-hash` is pure and matches the on-chain `hashv` (cross-check vs `commit`).
- `commit`→`reveal` round-trip e2e (needs a drawn panel → coord with `draw`).
- `--salt random` on commit must be re-suppliable to reveal (print it; support
  `--salt-from`).

## Cross-epic

Needs `draw:*` panel populated before reveal/finalize e2e.
