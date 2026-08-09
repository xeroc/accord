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

### `lifecycle:create-subaccord [flags] [--random-risk-type] [--dry-run]`

Permissionlessly create a Subaccord (dispute pool). The loaded wallet becomes
the Subaccord authority and the fee payer. All `CaseTerms` params are frozen at
creation; later changes go through `propose-update`/`execute-update`.

```bash
useaccord lifecycle:create-subaccord --random-risk-type \
  --evidence-spec 0000…0001 --staking-token <mint> --fee-token <mint> \
  --min-stake 1000 --alpha-bps 1000 --review-window 604800 --commit-window 172800 \
  --reveal-window 172800 --appeal-window 259200 --max-appeals 3 \
  --fee-per-juror 0 --reveal-threshold-bps 6666 --max-draw-attempts 3 \
  --evidence-operator <addr>
```

### `lifecycle:propose-update --subaccord <pda> --payload <Kind:value> [--nonce <n>] [--dry-run]`

Authority-gated proposal to update one mutable Subaccord parameter; arms the
48h (`UPDATE_TIMELOCK_SLOTS`) timelock. `--payload` is `Kind:value` where Kind
is one of `MinStake`, `AlphaBps`, `ReviewWindow`, `CommitWindow`, `RevealWindow`,
`AppealWindow`, `MaxAppeals`, `FeePerJuror`, `Authority`, `EvidenceOperator`.
After sending, the exact `executeAfterSlot` is read back from the PendingUpdate
account and emitted.

### `lifecycle:execute-update --subaccord <pda> --pending-update <pda> [--dry-run]`

Permissionless crank that lands a pending update once the timelock elapses.

### `lifecycle:pause [--dry-run]`

Instant emergency freeze (pause authority only). The PauseState PDA is derived
from the canonical program id.

### `lifecycle:propose-unpause [--dry-run]`

Arm the 24h (`UNPAUSE_TIMELOCK_SLOTS`) unpause timelock (pause authority only).

### `lifecycle:execute-unpause [--dry-run]`

Permissionless crank that clears the paused flag once the unpause timelock
elapses.

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
