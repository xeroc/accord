# VRF & Draw — Stake-Weighted Panel Selection

Accord selects a panel of jurors via a **VRF-committed sortition** against a
frozen Merkle-Sum Tree root. The flow is:

```
request_vrf ──► oracle callback ──► committed_vrf + frozen_root set ──► draw_seat × N
                  (one-shot)        (one root, all rounds/appeals)        (one tx per seat)
```

These commands wrap the SDK's `methods/vrf.ts`. The **cranker automates the
whole flow** (milestone `accord-27r5`); the CLI is for manual operation and
inspection. All PDAs are derived from `--dispute` — no manual entry.

## Commands

### `draw:request-vrf`

CPIs into the **magicblock VRF oracle** (`RequestVrfExtras`: `oracleQueue`,
`programIdentity`). One-shot — both `request_vrf` and the oracle callback
require `committed_vrf.is_none()`, so a repeat is a `VrfAlreadyCommitted`
no-op. The callback freezes `dispute.frozen_root` + `frozen_total_stake`
atomically with the randomness.

```bash
useaccord draw:request-vrf --dispute cordh…yKed
# → { signature: "4f…", committed: false }   # randomness lands async via callback

# Build the instruction without sending (safe preview; see Surfpool note below):
useaccord draw:request-vrf --dispute cordh…yKed --dry-run
```

> **Surfpool:** `request_vrf` **reverts** — the oracle is not on a Surfnet. In
> tests, inject the result directly via the `injectCommittedVrf` cheatcode
> (`tests/src/setup/vrf.ts`), which also writes `frozen_root` +
> `frozen_total_stake` (required by `draw_seat`). The CLI command is only
> runnable against devnet/mainnet.

SDK: `requestVrf(client, programId, accounts, extras)`

### `draw:await-vrf`

Poll `dispute.committed_vrf` until the oracle callback lands (or `timeoutMs`
elapses). Defaults: poll every 400 ms, give up after 30 s. Use it between
`request-vrf` and any `resolve-*`/`seat` command.

```bash
useaccord draw:await-vrf --dispute cordh…yKed
# → { committedVrf: "a5a5a5…(32 bytes)" }

useaccord draw:await-vrf --dispute cordh…yKed --poll 200 --timeout 60000
```

SDK: `awaitCommittedVrf(client, dispute, { pollIntervalMs, timeoutMs })`

### `draw:resolve-seat` — read-only

Resolve one seat **offline** (no chain write). Reads `committed_vrf` +
`frozen_root` + `frozen_total_stake` off the Dispute, fetches the Subaccord's
`JurorStake` accounts (`getProgramAccounts`), rebuilds the MST
(`buildAccumulator`), verifies the reconstructed root **equals** the frozen
root, runs the sortition, and prints the selected leaf + its Merkle proof.

```bash
useaccord draw:resolve-seat --dispute cordh…yKed --round 0 --seat 1
# → {
#   leaf:       { juror: "Addr2…", stake: 3000 },
#   index:      1,
#   proof:      [{ siblingHash, siblingSum }, …],
#   retries:    0,
#   jurorStake: "cordh…stake…"
# }

useaccord draw:resolve-seat --dispute cordh…yKed --round 0 --seat 0 --json > seat0.json
```

`--draw-attempt <n>` (default `0`) selects the seed dimension for a shortfall
redraw (ADR-0021) — orthogonal to `--round`.

SDK: `resolveSeat(committedVrf, disputeBytes, roundIdx, seat, tree, alreadyDrawn, …)`

### `draw:seat`

Send **one** `draw_seat` transaction with a pre-resolved membership proof.
The Round PDA (`["round", dispute, round_idx]`) is `init_if_needed` on-chain
and persists across the N seat txs. The 1232-byte packet can hold only one
proof, hence one tx per seat.

```bash
useaccord draw:seat --dispute cordh…yKed --membership seat0.json
# → { signature: "5b…", seat: 0 }

# Or pipe a resolved seat straight in:
useaccord draw:resolve-seat --dispute cordh…yKed --round 0 --seat 2 --json \
  | useaccord draw:seat --dispute cordh…yKed --membership -
```

SDK: `drawSeat(client, programId, accounts, roundPda, seat, membership)`

### `draw:resolve-panel` — composite, read-only

Loop `resolve-seat` across the full panel size (derived from `--round` via the
ladder: round 0 = 3 seats, each appeal doubles + 1). Prints a `SeatMembership[]`
array; pair with `--out` for the pipeline below.

```bash
useaccord draw:resolve-panel --dispute cordh…yKed --round 0 --out panel.json
# → wrote 3 seats to panel.json
```

### `draw:submit-panel` — composite

Send all `draw_seat` txs for the panel. Reads memberships from `--membership
<file|->`, or runs `resolve-panel` inline if omitted.

```bash
# Resolve once, then submit (inspect panel.json between the two steps):
useaccord draw:resolve-panel --dispute cordh…yKed --round 0 --out panel.json
useaccord draw:submit-panel --dispute cordh…yKed --membership panel.json

# One-shot (resolve + submit inline):
useaccord draw:submit-panel --dispute cordh…yKed --round 0
```

## Sortition math (what `resolve-seat` computes)

Per seat `i`, matching the on-chain verifier (`lib.rs`):

```
vrf_seed = sha256(committed_vrf ‖ dispute ‖ round_idx_le4 ‖ draw_attempt_le4)
r_i      = u64_le(sha256(vrf_seed ‖ seat_le4 ‖ retry_le4)[0..8]) % frozen_total_stake
```

`findLeafForSlot` picks the leaf whose range `[prefix, prefix+stake)` contains
`r_i`. On a **collision** (juror already drawn) or a zero-stake gap, `retry`
increments and the slot is re-derived — the on-chain verifier independently
confirms every prior retry genuinely collided, so there is **no caller choice**
in the `(leaf, retries)` pair (bean `accord-tzo0`).

## Verify before submitting

`frozen_root` is the **live** accumulator root captured at callback time. If a
juror calls `request_withdraw` between freeze and draw, the locally rebuilt tree
diverges. `resolve-seat`/`resolve-panel` **verify the reconstructed root equals
`dispute.frozen_root`** and refuse to emit a proof on mismatch. Never submit a
`draw_seat` against a stale tree — the on-chain check fails with
`SortitionMismatch`. The cranker skips and retries the next cycle on mismatch
(bean `accord-34p9`).

## Surfpool / testing

```ts
// tests/src/setup/vrf.ts — bypass the oracle in the e2e suite
import { injectCommittedVrf } from "./setup/vrf";
await injectCommittedVrf(env, dispute, random32Bytes); // sets committed_vrf + frozen root/sum
// then resolve-seat / draw-seat proceed normally
```

See: ADR-0009 §2, ADR-0012, ADR-0013, ADR-0021; `programs/accord/src/lib.rs`
(`request_vrf`, `commit_vrf_callback`, `draw_seat`); SDK `methods/vrf.ts`,
`methods/mst.ts`.
