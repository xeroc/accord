# @useaccord/cli

`useaccord` — operator CLI for the [Accord](../../) arbitration program on
Solana. Built on [`@useaccord/sdk`](../../packages/sdk) (the `Accord` facade) +
[`oclif`](https://oclif.io).

## Install (workspace)

```bash
pnpm install        # links @useaccord/sdk + @useaccord/cli
```

The binary is `useaccord`. In this bun-based monorepo, run it from source:

```bash
pnpm --filter @useaccord/cli run dev -- pause_state initialize
# or directly:
bun run apps/cli/bin/dev.js pause_state initialize
```

## Configuration

| Flag / Env | Description | Default |
|---|---|---|
| `--wallet`, `-k` / `ANCHOR_WALLET` | Path to a Solana keypair JSON file (a `[..64 uint8..]` array). **Required.** The keypair is the fee payer **and** becomes the on-chain pause authority. | — |
| `--rpc`, `-r` / `ACCORD_RPC_URL` | Solana JSON-RPC endpoint. | `http://127.0.0.1:8899` |
| `--ws`, `-w` / `ACCORD_WS_URL` | Solana WebSocket endpoint. | derived from `--rpc` (`8899→8900`, `http→ws`) |

## Commands

### `useaccord pause_state initialize`

One-time initialization of the PauseState singleton PDA (seeds `["pause"]`),
recording the wallet as the pause authority. Must run exactly once per program
deployment, before any `pause` / `propose_unpause` / `execute_unpause`.

```bash
export ANCHOR_WALLET=~/.config/solana/id.json
export ACCORD_RPC_URL=http://127.0.0.1:8899

useaccord pause_state initialize
```

```
authority : 9aJb2…
pauseState: 3hQYw…

sending initialize_pause…
✓ confirmed: 4xFoo…baz
```

`--dry-run` resolves the PauseState PDA and builds the instruction without
sending, useful for verifying wiring against a new deployment.

## Development

```bash
pnpm --filter @useaccord/cli run lint     # eslint
pnpm --filter @useaccord/cli run build    # tsc → dist/
pnpm --filter @useaccord/cli run test     # bun test
```

- `bin/dev.js` — loads TypeScript commands from `src/commands` (bun native).
- `bin/run.js` — loads compiled commands from `dist/commands` (after `build`).
