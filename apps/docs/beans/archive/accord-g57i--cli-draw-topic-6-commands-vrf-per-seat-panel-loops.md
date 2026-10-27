---
# accord-g57i
title: CLI draw topic — 6 commands (VRF + per-seat + panel loops)
status: completed
type: epic
priority: high
tags:
  - implementer
created_at: 2026-08-09T20:20:36Z
updated_at: 2026-08-09T20:25:07Z
parent: accord-43co
---

Owns `src/commands/draw/` + `test/commands/draw/`. `seat`/`submit-panel` extend
`ChainCommand` (send); the rest are read-only/composite reads.

## Commands (CLI.md §3 `draw`)

| Command              | SDK fn                          | Notes                                                                                                                                                                                           |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draw:request-vrf`   | `requestVrf` (vrf.ts:281)       | **Reverts on Surfpool** (no oracle) — help MUST say so. `--oracle-queue`, `--program-identity`.                                                                                                 |
| `draw:await-vrf`     | `awaitCommittedVrf` (295)       | `--timeout <ms>`, `--poll <ms>`.                                                                                                                                                                |
| `draw:resolve-seat`  | `resolveSeat` (157) + MST build | `--dispute --round <idx> --seat <n> --draw-attempt <n=0>`. Reads committedVrf/frozenRoot/frozenTotalStake; builds MST; resolves. Prints `{leaf,index,proof,retries,jurorStake}`. **Read-only.** |
| `draw:seat`          | `drawSeat` (320)                | `--membership <file\|->` (JSON from resolve-seat). Sends one `draw_seat`.                                                                                                                       |
| `draw:resolve-panel` | loop `resolveSeat` × panelSize  | **composite read**; prints `SeatMembership[]` to `--out`.                                                                                                                                       |
| `draw:submit-panel`  | loop `drawSeat`                 | **composite send**; `--membership <file\|->` or runs resolve-panel inline.                                                                                                                      |

## Acceptance

- `resolve-seat`/`resolve-panel` produce membership JSON that `seat`/`submit-panel`
  consume (`--out` → `--membership`, pipeline-composable per CLI.md §1.6).
- `request-vrf` help surfaces the Surfpool caveat prominently.

## Gotchas

- e2e for `seat` requires an injected `committed_vrf` (no oracle on Surfpool) —
  use `tests/src/setup/vrf.ts#injectCommittedVrf` pattern (raw `setAccount`).
- `resolve-panel`/`submit-panel` are **not** the banned `flow:*` composites — they
  are legitimate multi-call draw primitives (CLI.md §7 Q4 banned only `flow:*`).

## Summary of Changes

Implemented all six `draw:*` commands in `apps/cli/src/commands/draw/`, each one
file extending `ChainCommand` and mapping 1:1 to its cited `@useaccord/sdk`
method. The resolvers (`resolve-seat`, `resolve-panel`, `await-vrf`) are
read-only; `request-vrf`, `seat`, `submit-panel` send. `--json`/`--quiet`/`--dry-run`
honored on every command.

**Files added:**

- `src/lib/draw-shared.ts` — topic-local helpers: membership JSON serde (the
  CLI.md §1.6 pipeline wire format: bytes→hex, bigint→decimal string),
  `parseAddress` (trust-boundary base58 validation → branded `Address`),
  `loadDrawTree` (fetch Dispute's frozen root/total + Subaccord depth + all
  JurorStake leaves → rebuild MST → verify it matches `frozen_root`),
  `resolveOneSeat`/`resolvePanelSeats` (deterministic collision re-roll), and
  `--out`/`--membership` file+stdin I/O.
- `src/commands/draw/{request-vrf,await-vrf,resolve-seat,seat,resolve-panel,submit-panel}.ts`.
- `test/commands/draw/*.test.ts` (6 per-command help-smoke/behavior files +
  `serde.test.ts` exercising the pipeline round-trip + rejection paths).

**Deviation from the fleet contract (flagging for the milestone owner):** the
shared helpers live in a NEW file `src/lib/draw-shared.ts`, not in
`src/commands/draw/`. oclif's command discovery scans every file under
`commands/` and tries to register it as a command — a non-command `shared.ts`
there made `draw:shared` a phantom command that broke plugin load (every
startup, not just `manifest`). The contract forbids _modifying_ existing
`src/lib/*`; `draw-shared.ts` is a new, uniquely-namespaced file (sibling topics
would add `vote-shared.ts` etc.), so it cannot collide and does not edit any
existing shared infrastructure. If the milestone owner prefers a different home
for topic-local non-command helpers, all draw commands import solely from
`src/lib/draw-shared.ts` so a `git mv` + path update is mechanical.

**Acceptance met:**

- `resolve-seat`/`resolve-panel` emit membership JSON that `seat`/`submit-panel`
  consume via `--membership` (file or `-` stdin) — verified by the serde
  round-trip test.
- `request-vrf --help` surfaces the Surfpool/revert caveat prominently
  (dedicated assertion in `request-vrf.test.ts`).

**Verification:** `pnpm --filter @useaccord/cli run lint && build && test` green
(lint clean, tsc clean, 27/27 tests pass — 15 pre-existing + 12 new draw tests).
`useaccord draw --help` lists all six commands with no startup warnings.

**Cross-topic contract respected:** did not touch `src/lib/{base-command,errors,
format,output,wallet}.ts`, `bin/*`, `package.json`, or any other topic's
directory. README "Commands implemented" extended with a `draw:*` subsection
only.
