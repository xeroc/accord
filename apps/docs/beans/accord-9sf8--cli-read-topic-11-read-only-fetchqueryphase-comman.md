---
# accord-9sf8
title: CLI read topic — 11 read-only fetch/query/phase commands
status: completed
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

| Command                                           | SDK fn                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `read:subaccord <addr>`                           | `fetchMaybeSubaccord`                                             |
| `read:dispute <addr>`                             | `fetchMaybeDispute`                                               |
| `read:round <addr>`                               | `fetchMaybeRound`                                                 |
| `read:juror-stake <addr>`                         | `fetchMaybeJurorStake`                                            |
| `read:pause-state`                                | `fetchMaybePauseState` (singleton, no arg)                        |
| `read:pending-update <addr>`                      | `fetchMaybePendingUpdate`                                         |
| `read:appeal-bond --dispute --round-idx <n>`      | `fetchMaybeAppealBond` (derives PDA)                              |
| `read:disputes --by-subaccord\|--by-filer\|--all` | `findDisputesBySubaccord`/`findDisputesByFiler`/`findAllDisputes` |
| `read:juror-stakes --by-subaccord\|--by-juror`    | `findJurorStakesBySubaccord`/`findJurorStakesByJuror`             |
| `read:subaccords`                                 | `findAllSubaccords`                                               |
| `read:phase --dispute [--round]`                  | `disputePhase` (disputePhase.ts:37)                               |

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

## Summary of Changes

All 11 `read:*` commands implemented in `apps/cli/src/commands/read/`, each a
thin `ChainCommand` wrapper around its cited SDK fn (`fetchMaybe*` for single
accounts, `find*` GPA wrappers for bulk, `disputePhase` for the phase helper).

- `src/commands/read/` — 11 files: `subaccord`, `dispute`, `round`,
  `juror-stake`, `pause-state` (singleton PDA), `pending-update`, `appeal-bond`
  (derives PDA via `findAppealBondPda`), `disputes` (exactly-one-filter guard),
  `juror-stakes` (exactly-one-filter guard), `subaccords`, `phase`.
- `src/read-io.ts` — topic-local shared helpers (kept out of `src/lib/` so it
  ships with the topic, no shared-infra churn): `outFlag`, bigint/Uint8Array/
  Option-safe `serialize`, `emitAccountRead` (found/missing → `{exists:bool}`
  exit 0), `emitListRead` (numbered addresses + one-line summaries), and
  `summarizeFields` (truncated addrs, grouped bigints, ISO timestamps for
  `*End|*At` fields).
- `test/commands/read/read.test.ts` — help-smoke for all 11 + filter-guard
  assertions for `read:disputes` / `read:juror-stakes`.
- `test/commands/read/read-io.test.ts` — pure-fn behavior: `jsonSafe`,
  `serialize`, `summarizeFields`, `writeOut`.
- `apps/cli/README.md` — added the `read:*` table to "Commands implemented".

Acceptance met: missing account → `{exists:false}` (exit 0); found → decoded
JSON (`--json`) / human table; `--out <file>` pipes the payload; `read:phase`
returns the phase label + window countdown.

Exit gate: `pnpm --filter @useaccord/cli run lint && build && test` green
(41 pass / 0 fail across 4 files). `useaccord read --help` lists all 11.
