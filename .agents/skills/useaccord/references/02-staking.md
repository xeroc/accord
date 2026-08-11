# 02 — Staking (`useaccord staking:*`)

Juror capital: stake, two-phase unstake, the reconcile crank, fee pull, and the
pure unstake guard. All commands are thin wrappers over
`@useaccord/sdk` `methods/staking.ts` (+ `stakeFlow.ts`). On-chain handlers live
in `programs/accord/src/lib.rs`; constants in `constants.rs`.

**Common flags:** `--subaccord <addr>`, `--amount <lamports>`,
`--pause-state <addr|auto>` (auto-derives the PauseState singleton). Global
flags (`--rpc`, `--keypair`, `--commitment`, `--dry-run`, `--json`, `--quiet`)
apply to every command. The loaded `--keypair` wallet is fee payer **and**
signing juror for all six.

| Command | SDK fn (`methods/staking.ts`) | Sends? |
| --- | --- | --- |
| `staking:stake` | `stake` | yes |
| `staking:request-withdraw` | `requestWithdraw` | yes (ledger-only tx) |
| `staking:withdraw` | `withdraw` | yes |
| `staking:reconcile` | `reconcileStake` | yes (any caller) |
| `staking:reclaim-slot` | `reclaimSlot` | yes (any caller, permissionless crank) |
| `staking:withdraw-fees` | `withdrawFees` | yes |
| `staking:can-unstake` | `canUnstake` | **no — pure pre-check** |

## Auto MST proof

`stake` / `request-withdraw` / `reconcile` need the juror's accumulator Merkle
path (ADR-0012). By default the CLI auto-derives it (`prepareStakeProof`,
`stakeFlow.ts`): fetch all the Subaccord's `JurorStake` accounts →
`buildAccumulator` → verify the rebuilt root equals the on-chain `subaccord.rootHash`
(stale local data ⇒ error) → `proofFor(tree, index)`. Escape hatch for offline /
advanced use: `--path-from <file>` (a JSON path from `accumulator:proof`).

## `staking:stake` — add collateral

`stake` (lib.rs `stake`). Reverts while the circuit breaker is paused
(`ProgramPaused`); `amount > 0` (`InvalidAmount`).

**Flow:** SPL-transfer `amount` of the staking token from the juror's ATA →
Subaccord `stake_vault` → **reload the vault** (fee-on-transfer safe; credits the
real delta received) → `verify_and_recompute` against `rootHash` → write new
`staked` + `root_hash` + `total_stake`. A first-time staker is appended at
`subaccord.next_index` **or pops a recycled slot from the free list** if one is
available (RECLAIM-LEAF — closes the permanent-DoS hole where `next_index` only
grows). A full tree with an empty free list ⇒ `TreeFull`; a top-up / re-stake
updates the existing `tree_index`. When popping a recycled slot, pass
`--freed-slot <addr>` (the freed JurorStake PDA whose `tree_index == freeHead`).

```bash
useaccord staking:stake \
  --subaccord subAxK9…rd1 \
  --amount 5_000_000_000          # 5 tokens (9 decimals)
# → { "signature": "…", "subaccord": "subAxK9…", "juror": "…", "staked": 5000000000 }
```

## `staking:request-withdraw` — phase 1 (declare intent)

`requestWithdraw` (lib.rs `request_withdraw`). **Ledger-only — no SPL transfer.**
Subtracts `amount` from `staked`, banks it in `pending_withdrawal`, stamps
`withdraw_requested_at = now`, and recomputes the root **immediately** (the juror's
sortition weight drops right away). Allowed while paused.

**Gates:**

- `amount > 0` (`InvalidAmount`).
- `pending_withdrawal == 0` — **M-1 fix** (`WithdrawalPending`): repeated calls
  while a withdrawal is pending are rejected. A juror used to be able to keep
  resetting `withdraw_requested_at` indefinitely, gaming the timelock. Now they
  must complete `withdraw` before requesting again.
- `stake_delta == 0` (`PendingSettlement`): if the juror has a pending
  reward/slash, run `staking:reconcile` first.
- `amount ≤ staked − slash_reserve` (`InsufficientBalance`) — the reserve covers
  in-flight draw slashes.

```bash
# reconcile first if stake_delta != 0, else request-withdraw errors PendingSettlement
useaccord staking:request-withdraw \
  --subaccord subAxK9…rd1 \
  --amount 1_000_000_000
# → { "signature": "…", "pending_withdrawal": 1000000000 }
```

## `staking:withdraw` — phase 2 (transfer)

`withdraw` (lib.rs `withdraw`). **No args** — moves the banked
`pending_withdrawal` from `stake_vault` → the juror's staking-token ATA
(Subaccord PDA-signs the transfer).

**Gates:**

- `pending_withdrawal > 0` (`NoPendingWithdrawal`).
- `now ≥ withdraw_requested_at + WITHDRAWAL_DELAY` (`WithdrawalTooEarly`).
  `WITHDRAWAL_DELAY = 259_200` s (**3 days**; `constants.rs`). It is set equal to
  the pre-draw cancel timeout so any dispute that froze a root before the request
  has either completed its draw or become cancelable by the time the lock expires.
- `active_draws == 0` (`StakeLocked`) — capital is frozen while drawn into any
  open dispute.

```bash
# only succeeds 3 days after request-withdraw, once no dispute is live
useaccord staking:withdraw --subaccord subAxK9…rd1
# → { "signature": "…", "withdrawn": 1000000000 }
```

## `staking:reconcile` — fold the delta (permissionless crank)

`reconcileStake` (lib.rs `reconcile_stake`). Folds `stake_delta` (the net
reward/slash from settled disputes) into the canonical `staked` and updates the
accumulator root via a Merkle path. **No tokens move; any caller may run it.**
Requires `stake_delta != 0` (`InvalidAmount` otherwise); sets `stake_delta = 0`.
This is the precondition that clears `PendingSettlement` before
`request-withdraw`. The cranker does this automatically; the CLI exposes it for
manual runs.

```bash
useaccord staking:reconcile --subaccord subAxK9…rd1
# → { "signature": "…", "staked": 5032000000, "stake_delta": 0 }
```

## `staking:reclaim-slot` — recycle a drained slot (permissionless crank)

`reclaimSlot` (lib.rs `reclaim_slot`, RECLAIM-LEAF). Pushes a fully-drained
JurorStake's `tree_index` onto the Subaccord's free-list, blanking the leaf
identity to `(default, 0)`. This recycles the tree slot for reuse by a new
staker — closing the permanent-DoS hole where `next_index` only grows and can be
exhausted by a griefing attacker.

**Preconditions:** `staked == 0`, `active_draws == 0`, `stake_delta == 0`,
`fees_earned == 0`. Double-reclaim is prevented by root verification.

```bash
useaccord staking:reclaim-slot --subaccord subAxK9…rd1
# → { "signature": "…", "reclaimed_index": 7 }
```

## `staking:withdraw-fees` — pull earned fees

`withdrawFees` (lib.rs `withdraw_fees`, ADR-0020 two-mint model). Per-juror pull
of aggregate `fees_earned` from the Subaccord's `fee_vault` → the juror's
**fee-token** ATA (separate mint from the staking token). No `active_draws` gate,
no timelock — earned fees are not at-risk capital. Requires `fees_earned > 0`
(`NoFeesEarned`).

**H-2 fix:** the withdrawal is **capped at the vault balance** as
defense-in-depth: `withdrawable = fees_earned.min(fee_vault.amount)`. With the
C-1 fix in place (`cancel_dispute` refunds `fee_paid`, not the shared vault) the
invariant `fee_vault.balance ≥ Σ fees_earned` holds and the cap never truncates.
If it ever does (future bug / fee-on-transfer drift), the unpaid remainder stays
in `fees_earned` for retry rather than being zeroed without payment.

```bash
useaccord staking:withdraw-fees --subaccord subAxK9…rd1
# → { "signature": "…", "withdrawn_fees": 7500000 }
```

## `staking:can-unstake` — pure pre-check (no send)

`canUnstake` (staking.ts). Pre-flights an unstake against the juror's live stake,
mirroring the on-chain requires so a client rejects the tx **before** building or
sending it. Returns `{ ok, reason? }`. Reasons: `InvalidAmount` (`amount ≤ 0`),
`StakeLocked` (`active_draws > 0`), `InsufficientBalance` (`amount > staked`).

```bash
useaccord staking:can-unstake --subaccord subAxK9…rd1 --amount 1_000_000_000
# ok          → { "ok": true }
# locked      → { "ok": false, "reason": "StakeLocked" }
# too much    → { "ok": false, "reason": "InsufficientBalance" }
```

> **SDK escape hatch:** every command here is reachable directly via
> `@useaccord/sdk` (`stake`, `requestWithdraw`, `withdraw`, `reconcileStake`,
> `reclaimSlot`, `withdrawFees`, `canUnstake`). The CLI is the thin, single-signer
> wrapper; multi-signer or batched flows use the SDK.
