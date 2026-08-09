---
# accord-9sf8
title: CLI read topic — 11 read-only fetch/query/phase commands
status: todo
type: epic
priority: normal
tags:
    - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T21:25:02Z
parent: accord-43co
---

Owns `src/commands/read/` + `test/commands/read/`. **All read-only** — extends
`ChainCommand` (needs rpc; signer optional but loaded for default address). All
support `--json`/`--out`.

## Commands (CLI.md §3 `read`)

| Command | SDK fn |
|---|---|
| `read:subaccord <addr>` | `fetchMaybeSubaccord` |
| `read:dispute <addr>` | `fetchMaybeDispute` |
| `read:round <addr>` | `fetchMaybeRound` |
| `read:juror-stake <addr>` | `fetchMaybeJurorStake` |
| `read:pause-state` | `fetchMaybePauseState` (singleton, no arg) |
| `read:pending-update <addr>` | `fetchMaybePendingUpdate` |
| `read:appeal-bond --dispute --round-idx <n>` | `fetchMaybeAppealBond` (derives PDA) |
| `read:disputes --by-subaccord\|--by-filer\|--all` | `findDisputesBySubaccord`/`findDisputesByFiler`/`findAllDisputes` |
| `read:juror-stakes --by-subaccord\|--by-juror` | `findJurorStakesBySubaccord`/`findJurorStakesByJuror` |
| `read:subaccords` | `findAllSubaccords` |
| `read:phase --dispute [--round]` | `disputePhase` (disputePhase.ts:37) |

## Acceptance

- Missing account → `emitRead({exists:false})`, not an error (exit 0).
- Found → decoded account (json) / human table (truncated addrs, grouped bigints,
  ISO timestamps via `format.ts`).
- `--out <file>` writes the json payload for piping.
- `read:phase` returns the phase label + window countdown (dashboard helper).

## Notes

Largest command count but mechanically uniform — one fetch/query wrapper each.
Use the generated `fetchMaybe*` (work with raw Kit RPC) and `find*` query
wrappers; do NOT use the facade's `fetchX` (needs `ClientWithRpc`, breaks over raw
rpc — see SDK index.ts decoder note).
