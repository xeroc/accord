# @useaccord/cli

`useaccord` — operator CLI for the [Accord](../../) arbitration program on Solana.
Thin wrapper over [`@useaccord/sdk`](../../packages/sdk) (the `Accord` facade);
built on [`oclif`](https://oclif.io) v4 (ESM/bun).

> **Status:** shared infrastructure + the first commands landed. The remaining
> leaf commands (`staking:*`, `dispute:*`, `draw:*`, `vote:*`, `appeal:*`,
> `settle:*`, `accumulator:*`, `read:*`) plug into the base classes below and are
> implemented in parallel. Interface spec: `.agents/skills/useaccord/CLI.md`.

## Run

This is a bun-first workspace. The CLI imports `@useaccord/sdk`'s compiled
output (which bun resolves natively), so run it via bun:

```bash
# dev (loads TypeScript from src/)
bun run apps/cli/bin/dev.js <command>

# production (loads compiled JS from dist/, after `pnpm --filter @useaccord/cli build`)
bun run apps/cli/bin/run.js <command>
```

## Configuration

Resolved in priority order (flag → env → default):

| Flag / Env        | Default                                                                | Meaning                                             |
| ----------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `--keypair`, `-k` | `$ANCHOR_WALLET` → `$ACCORD_KEYPAIR_PATH` → `~/.config/solana/id.json` | Fee payer **and** on-chain signer for every command |
| `--rpc`, `-r`     | `$ACCORD_RPC_URL` → `http://127.0.0.1:8899`                            | JSON-RPC endpoint                                   |
| `--ws`, `-w`      | `$ACCORD_WS_URL` (else derived from `--rpc`)                           | WebSocket (confirmations)                           |
| `--commitment`    | `confirmed`                                                            | `processed`/`confirmed`/`finalized`                 |
| `--json`          | off                                                                    | One JSON object on stdout (for `jq`)                |
| `--quiet`, `-q`   | off                                                                    | Only the signature (send) or address (create/read)  |
| `--dry-run`       | off                                                                    | Build + print the instruction; do not sign/send     |

**Single-signer model:** the `--keypair` wallet is the fee payer **and** the
instruction's signing account for every command (the SDK adapter pins
`accord.signer`). Multi-signer choreography stays in the SDK/tests.

## Commands implemented

### `config:show` — resolved config + payer balance

```bash
useaccord config:show
```

```
rpc        : http://127.0.0.1:8899
keypair    : ~/.config/solana/id.json
authority  : 3vbYr…hzP3
programId  : cordh…yKed
commitment : confirmed
balance    : 10_000_000_000_000 lamports (◎ 10000)
```

### `config:balance [--address <addr>] [--token-mint <mint>]`

SOL balance (default) or SPL balance (via the derived ATA). Defaults to the
loaded wallet.

### `lifecycle:init-pause [--skip-if-exists] [--dry-run]`

One-time init of the PauseState singleton PDA (`methods.initializePause`); the
wallet becomes the pause authority. `--skip-if-exists` is idempotent.

```bash
useaccord lifecycle:init-pause
```

```
✓ confirmed: Lu4kfssBXDQn…
  authority: 3vbYr…hzP3
  pauseState: AaNWS…XVG9
```

### `staking:*` — juror capital (stake / unstake / reconcile / fees)

| Command                    | SDK fn                    | Notes                                                                |
| -------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `staking:stake`            | `methods.stake`           | Auto-builds the MST proof; `--path-from <file>` for offline          |
| `staking:request-withdraw` | `methods.requestWithdraw` | Phase 1 — banks `pending_withdrawal` (ledger-only)                   |
| `staking:withdraw`         | `methods.withdraw`        | Phase 2 — moves tokens (gated by delay + `active_draws==0`)          |
| `staking:reconcile`        | `methods.reconcileStake`  | Permissionless crank — folds `settlement_delta` into `staked`        |
| `staking:withdraw-fees`    | `methods.withdrawFees`    | Pull aggregate `fees_earned` from the `fee_vault` (ADR-0020)         |
| `staking:can-unstake`      | `canUnstake`              | **Pure pre-check** (offline) — `{ canUnstake, activeDraws, reason }` |

Common flags: `--subaccord <pda>` (required), `--juror <addr>` (default signer),
`--amount <u64>` (stake/request-withdraw), `--pause-state <pda>` (stake; auto-derived),
`--path-from <file>` (stake/request-withdraw/reconcile). Chain commands also take
the global `--rpc/--keypair/--dry-run/--json/--quiet`.

**Auto vs manual MST path** — by default `stake`/`request-withdraw`/`reconcile`
fetch all `JurorStake`s for the Subaccord and call `prepareStakeProof`; a stale
local view throws `AccumulatorRootMismatch` (retry the read). `--path-from`
reads a proof JSON (`{path: [{siblingHash, siblingSum}]}` or a bare array) —
round-trips `accumulator:prepare-stake-proof` output — and is parsed before any
network call, so a bad file fails fast.

```bash
useaccord staking:stake --subaccord 7vrF… --amount 1_000_000
```

```
✓ confirmed: 4k2N…
  subaccord: 7vrF…zK9u
  jurorStake: Gd5P…r8Qa
  amount: 1_000_000
  leafIndex: 3
  mode: auto
```

```bash
useaccord staking:can-unstake --staked 1000 --active-draws 2 --amount 500
```

```
canUnstake : no
activeDraws: 2
reason     : StakeLocked
```

## Infrastructure (for future commands)

Every command extends one of two base classes in `src/lib/base-command.ts`:

- **`BaseCommand`** — output modes (`--json`/`--quiet`) + error mapping
  (`AccordErrors` → `{ error, message, hint }`). For pure/offline commands
  (`accumulator:*`, `commit-hash`, `required-fee`).
- **`ChainCommand extends BaseCommand`** — adds chain flags, loads the `Accord`
  facade (`loadChain`), and runs the build→sign→send pipeline (`sendInstruction`)
  - `--dry-run` instruction dump.

Shared helpers: `src/lib/{format,output,errors,wallet}.ts` (address truncation,
bigint grouping, json/quiet renderers, AccordError mapping, keypair/env
resolution). A new leaf command is one file under
`src/commands/<topic>/<name>.ts` spreading `chainFlags` and calling one SDK
method.

## Development

```bash
pnpm --filter @useaccord/cli run lint      # eslint
pnpm --filter @useaccord/cli run build     # tsc → dist/  (clean first: rm -rf dist)
pnpm --filter @useaccord/cli run test      # bun test (infra unit + command smoke)
```

> `tsc` does not prune `dist/` — run `rm -rf dist && pnpm build` after
> renaming/moving command files, or stale entries confuse oclif's command scan.
