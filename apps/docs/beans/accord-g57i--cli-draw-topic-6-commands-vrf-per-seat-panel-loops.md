---
# accord-g57i
title: CLI draw topic — 6 commands (VRF + per-seat + panel loops)
status: todo
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

| Command | SDK fn | Notes |
|---|---|---|
| `draw:request-vrf` | `requestVrf` (vrf.ts:281) | **Reverts on Surfpool** (no oracle) — help MUST say so. `--oracle-queue`, `--program-identity`. |
| `draw:await-vrf` | `awaitCommittedVrf` (295) | `--timeout <ms>`, `--poll <ms>`. |
| `draw:resolve-seat` | `resolveSeat` (157) + MST build | `--dispute --round <idx> --seat <n> --draw-attempt <n=0>`. Reads committedVrf/frozenRoot/frozenTotalStake; builds MST; resolves. Prints `{leaf,index,proof,retries,jurorStake}`. **Read-only.** |
| `draw:seat` | `drawSeat` (320) | `--membership <file\|->` (JSON from resolve-seat). Sends one `draw_seat`. |
| `draw:resolve-panel` | loop `resolveSeat` × panelSize | **composite read**; prints `SeatMembership[]` to `--out`. |
| `draw:submit-panel` | loop `drawSeat` | **composite send**; `--membership <file\|->` or runs resolve-panel inline. |

## Acceptance

- `resolve-seat`/`resolve-panel` produce membership JSON that `seat`/`submit-panel`
  consume (`--out` → `--membership`, pipeline-composable per CLI.md §1.6).
- `request-vrf` help surfaces the Surfpool caveat prominently.

## Gotchas

- e2e for `seat` requires an injected `committed_vrf` (no oracle on Surfpool) —
  use `tests/src/setup/vrf.ts#injectCommittedVrf` pattern (raw `setAccount`).
- `resolve-panel`/`submit-panel` are **not** the banned `flow:*` composites — they
  are legitimate multi-call draw primitives (CLI.md §7 Q4 banned only `flow:*`).
