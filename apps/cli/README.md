# @useaccord/cli

`useaccord` — operator CLI for the [Accord](../../) arbitration program on Solana.
Thin wrapper over [`@useaccord/sdk`](../../packages/sdk) (the `Accord` facade);
built on [`oclif`](https://oclif.io) v4 (ESM/bun).

> **Status:** shared infrastructure + the first commands landed. The remaining
> leaf commands (`staking:*`, `dispute:*`, `draw:*`, `vote:*`,
> `settle:*`, `accumulator:*`, `read:*`) plug into the base classes below and are
> implemented in parallel. `config:*`, `lifecycle:init-pause`, and `appeal:*` are
> landed. Interface spec: `.agents/skills/useaccord/CLI.md`.

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

### `dispute:*` — Arbitrable intake (4 commands)

| Command                | SDK fn                  | Sends?    |
| ---------------------- | ----------------------- | --------- |
| `dispute:create`       | `methods.createDispute` | yes       |
| `dispute:ruling`       | `methods.getRuling`     | no (read) |
| `dispute:required-fee` | `requiredFee`           | no (pure) |
| `dispute:cancel`       | `methods.cancelDispute` | yes       |

```bash
# Pure fee check (no chain): 3 × fee-per-juror
useaccord dispute:required-fee --fee-per-juror 1_000_000
```

```
fee-per-juror : 1_000_000 lamports
fee          : 3_000_000 lamports
```

```bash
# File a dispute; --fee auto derives 3 × the Subaccord's feePerJuror
useaccord dispute:create --subcord <pda> --options <hex32>,<hex32>
```

```
address : <dispute-pda>
bump    : 254
fee     : 3_000_000
```

`dispute:ruling <pda>` reads `null` until the dispute reaches `Final`, then the
winning option index. `dispute:cancel <pda>` is the permissionless timeout exit
(`--remaining-accounts auto` derives the Round/JurorStake/AppealBond set).

### `settle:round --subaccord <addr> --dispute <addr> --round-idx <n> [--remaining-accounts auto|list] [--juror-stake <pda>...] [--dry-run]`

Permissionless per-round settlement crank (`methods.settleRound`). After a
dispute is `Final`, settles one prior round against the final ruling — slashes
incoherent jurors, redistributes the fee pool, releases the drawn seats.
`--remaining-accounts auto` (default) derives the panel `JurorStake` PDAs from
the fetched round; `list` takes explicit `--juror-stake` addresses. The `Round`
PDA is derived from `dispute + round-idx` unless `--round` overrides it.

```bash
useaccord settle:round --subaccord 6Lm… --dispute EKj… --round-idx 0
```

```
✓ confirmed: 3Fq9…
  round: 9by1…rhMf
  roundIdx: 0
  panel: 3
```

### `appeal:cost --current-round <n> --fee-per-juror <base> [--json]`

**Pure (offline, no chain).** Quote the panel + fee + bond for opening round
`--current-round + 1`. Panel follows the 2N+1 ladder (3 → 7 → 15 → 31);
`total` = new-round fee + equal bond, and is exactly what `appeal:open`
transfers.

```bash
useaccord appeal:cost --current-round 0 --fee-per-juror 1000000
```

```
new round    : 1
panel        : 7 jurors
new-round fee: 7_000_000
bond         : 7_000_000  (== fee; forfeit if no flip, refund if flip)
total payable: 14_000_000
```

### `appeal:open --dispute <addr> [--appellant <addr>] [--dry-run]`

Permissionless: open the next appeal round on a resolved dispute
(`methods.appeal`). The loaded wallet is the appellant (override with
`--appellant`) and pays `fee_new + bond`. Only `--dispute` is required; the
prior round, AppealBond, fee token, and both token accounts are derived from
the dispute + its Subaccord.

> **AppealBond PDA:** seeded by the round **being** appealed (`current_round`,
> before the increment) — `["bond", dispute, current_round]` (lib.rs:3361).
> `appeal:open` derives this automatically.

### `appeal:claim-refund --dispute <addr> --round-idx <n> [--claimant-token-account <ata>]`

Permissionless crank: sweep a flipped appeal bond back to its appellant after
`finalize_dispute` (`methods.claimAppealRefund`). `--round-idx` is the round
that was appealed (the AppealBond PDA seed). The refund lands in the
appellant's `feeToken` ATA (defaults to the loaded wallet's ATA). Idempotent.

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

### `accumulator:*` — offline MST helpers (pure)

The subtree-sum accumulator toolkit (ADR-0012). Four are pure (`BaseCommand`,
no signer/rpc); `prepare-stake-proof` reads chain. `build`→`proof`→`verify`
round-trips; output is byte-exact with the on-chain verifier.

```bash
# root for a stake set (deterministic, matches Subaccord.root_hash)
useaccord accumulator:build --leaves leaves.json --depth 16
# → rootHash / rootSum

# Merkle path for a leaf → the proof file `staking --path-from` consumes
useaccord accumulator:proof --leaves leaves.json --depth 16 --index 3 --json > proof.json

# verify a leaf+path against a known root; returns the sortition prefix
useaccord accumulator:verify --leaf '{"juror":"..","stake":"1000"}' \
  --index 3 --path proof.json --root ab12… --root-sum 9000

# all-zero (never-staked) tree root
useaccord accumulator:empty-root --depth 16

# fetch Subaccord + JurorStakes on-chain, build the canonical proof for a juror
useaccord accumulator:prepare-stake-proof --subaccord 7Nq.. --juror 3vbY..
```

**Proof file schema** (`accumulator:proof` / `prepare-stake-proof` emit;
`accumulator:verify --path` / `staking --path-from` consume):

```json
{
  "version": 1,
  "index": 3,
  "path": [{ "siblingHash": "<64 hex>", "siblingSum": "<u64 decimal>" }, …]
}
```

### `draw:*` — VRF + per-seat draw (methods/vrf.ts)

Six commands forming the draw pipeline (`request-vrf` → `await-vrf` →
`resolve-seat`/`resolve-panel` → `seat`/`submit-panel`). The resolvers are
read-only and emit the JSON membership artifacts the senders consume
(pipeline-composable per CLI.md §1.6).

| Command              | Sends? | SDK fn              | Purpose                                                                                                                                        |
| -------------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `draw:request-vrf`   | ✓      | `requestVrf`        | One-shot VRF oracle CPI; freezes the accumulator root. ⚠ **Reverts on Surfpool** (no oracle) — inject `committed_vrf` directly for local e2e. |
| `draw:await-vrf`     | read   | `awaitCommittedVrf` | Poll `committed_vrf` until the callback lands (`--timeout`, `--poll`).                                                                         |
| `draw:resolve-seat`  | read   | `resolveSeat` + MST | Resolve one seat's `(leaf, proof, retries)` off-chain → JSON to `--out`.                                                                       |
| `draw:seat`          | ✓      | `drawSeat`          | Submit one `draw_seat` for `--seat` from `--membership` JSON.                                                                                  |
| `draw:resolve-panel` | read   | `resolveSeat` × N   | Resolve the full panel (default size from the round ladder) → `SeatMembership[]` JSON.                                                         |
| `draw:submit-panel`  | ✓      | `drawSeat` × N      | Submit the whole panel, one tx per seat (from `--membership` or inline resolve).                                                               |

```bash
# resolve → submit pipeline (3-seat round-0 panel)
useaccord draw:resolve-panel --dispute <addr> --out panel.json
useaccord draw:submit-panel  --subaccord <a> --dispute <a> --membership panel.json

# or pipe a single seat straight through
useaccord draw:resolve-seat --dispute <addr> --seat 0 | \
  useaccord draw:seat --subaccord <a> --dispute <a> --seat 0 --membership -
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
