---
# accord-43co
title: Accord CLI — implement remaining commands (topic fleet)
status: todo
type: milestone
priority: high
created_at: 2026-08-09T20:19:36Z
updated_at: 2026-08-09T20:21:17Z
---

Implement every remaining `useaccord` command in `CLI.md` §3 by **parallelizing
across the fleet** — one `task` subagent per topic epic, each owning its own
topic directory so no two subagents touch the same files.

## Goal

Ship the full `useaccord` command tree (lifecycle / staking / dispute / draw /
vote / appeal / settle / accumulator / read) so every entry in CLI.md §3 maps to
a real command backed by exactly one `@useaccord/sdk` method. `config:*` is done;
`lifecycle:init-pause` is done.

## The contract — what already exists (READ-ONLY to the fleet)

The shared infrastructure landed in `f03e30f`. Every leaf command is ONE file and
extends one base class from `apps/cli/src/lib/base-command.ts`:

- **`ChainCommand`** — chain-touching commands. Provides `loadChain(flags)` →
  `{ accord, signer, ws, commitment }`, `sendInstruction(ctx, ix)` → signature,
  `emitDryRun(ix)`, and the global flags (`--rpc/-r`, `--keypair/-k`, `--ws/-w`,
  `--commitment`, `--dry-run`, `--json`, `--quiet/-q`, `--program-id`).
- **`BaseCommand`** — pure/offline commands (no signer, no rpc). Use for
  `accumulator:*`, `dispute:required-fee`, `vote:commit-hash`.
- Output: `this.emitSend(sig, extra)` / `this.emitCreated(addr, extra)` /
  `this.emitRead(data, {primary, human})` — already branch on `--json/--quiet`.
- Errors: `BaseCommand.catch()` already maps `AccordErrors` + Solana errors.

**Single-signer model:** the `--keypair` wallet is fee payer + the instruction's
signing account for every command. No `--as`. The SDK adapter pins
`accord.signer`; call the bound `ctx.accord.methods.<fn>(...)`.

Fleet must NOT modify `src/lib/*`, `bin/*`, `package.json`, or any other topic's
dir. New shared helpers, if genuinely needed by ≥2 topics, get proposed back to
the milestone owner (don't fork per-topic copies).

## Fleet execution model

```
parallel(thunks = epics.map(epic => () => agent(epic.assignment, {role: "CLI: <topic>"})))
```

- **One subagent per epic.** Each epic owns `src/commands/<topic>/` and
  `test/commands/<topic>/` — zero file collisions, so all 9 run concurrently.
- **Per-command shape:** `static flags = { ...chainFlags, ...own }`; `run()` does
  `this.applyOutput(flags)` → `loadChain(flags)` → one SDK call →
  `flags.dry-run ? emitDryRun(ix) : sendInstruction(ctx, ix)` → `emitSend/...`.
  Mirror `lifecycle/init-pause.ts` as the reference.
- **TDD per command:** add `test/commands/<topic>/<cmd>.test.ts` — help smoke +
  at least one behavior assertion (pure fns: real output; chain fns: `--dry-run`
  build + a Surfpool e2e send where feasible, reusing the `init-pause` pattern).
- **Exit gate per epic:** `pnpm --filter @useaccord/cli run lint && build && test`
  green; `--json`/`--quiet`/`--dry-run` honored on every command.
- **Colon command IDs:** file `src/commands/<topic>/<cmd>.ts` → id `<topic>:<cmd>`
  (hyphens in filename preserved). `topicSeparator: ":"` is already set.

## Cross-epic ordering (note, don't serialize)

- `dispute:create` must run before any `draw:*`/`vote:*` e2e (a Dispute must
  exist). For unit/dry-run this doesn't block.
- `draw:resolve-seat` feeds `draw:seat`; `vote:commit` feeds `vote:reveal` —
  intra-epic, each epic handles its own ordering.
- `draw:request-vrf` **reverts on Surfpool** (no oracle) — help must say so; the
  e2e harness injects `committed_vrf` directly (see `tests/src/setup/vrf.ts`).

## Epics (child beans)

- `lifecycle` — 6 remaining (create-subaccord … execute-unpause)
- `staking` — 6 (auto-MST-path stake/withdraw/reconcile)
- `dispute` — 4 (Arbitrable intake)
- `draw` — 6 (VRF + per-seat + composite panel loops)
- `vote` — 6 (commit/reveal/finalize/redraw + pure commit-hash)
- `appeal` — 3 (open + pure cost + claim-refund)
- `settle` — 1 (per-round crank)
- `accumulator` — 5 (**pure**, no chain — extends BaseCommand)
- `read` — 11 (**read-only** — fetch/query/phase; `--json`/`--out`)

## Definition of done

- Every CLI.md §3 command exists, maps 1:1 to its cited SDK fn, and passes its
  own test.
- `pnpm --filter @useaccord/cli run lint && build && test` green with the full
  set; `useaccord manifest` lists the whole tree.
- README §"Commands implemented" updated; CLI.md status line flipped from
  PROPOSAL → authoritative where each command lands.

## References

- Spec: `.agents/skills/useaccord/CLI.md` §3 (command → SDK fn:line).
- Reference command: `apps/cli/src/commands/lifecycle/init-pause.ts`.
- SDK method surface: `packages/sdk/src/methods.ts` (`AccordMethods`).
- e2e harness patterns: `tests/src/setup/{env,vrf,cheats}.ts`.

## Epic IDs (fleet addresses)

| Topic | Epic | Priority |
|---|---|---|
| lifecycle (6 left) | accord-k77u | normal |
| staking | accord-emou | high |
| dispute | accord-xt13 | high |
| draw | accord-g57i | high |
| vote | accord-ouph | high |
| appeal | accord-52qa | normal |
| settle | accord-9vss | normal |
| accumulator (pure) | accord-ecke | high |
| read (11) | accord-9sf8 | normal |

Run all 9 concurrently; e2e cross-deps are noted per-epic (soft, not hard blocks).
