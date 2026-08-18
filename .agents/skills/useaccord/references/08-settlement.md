# 08 — Settlement & Appeals

Per-round coherence economics and the appeal escalation ladder. The final
round settles inside `finalize_dispute`; every **prior** round settles via the
permissionless `settle_round` crank. Appeals reopen a dispute with a larger
`2N+1` panel funded by an exponential fee+bond deposit.

**Cranker automates** `settle_round` and `claim_appeal_refund`; manual CLI is
the escape hatch or for inspection.

| Command               | SDK fn (`packages/sdk/src/methods/`) | On-chain (`lib.rs`)     | Cranker |
| --------------------- | ------------------------------------ | ----------------------- | :-----: |
| `settle:round`        | `settleRound` (`settlement.ts`)      | `settle_round`          |   yes   |
| `appeal:open`         | `appeal` (`appeal.ts`)               | `appeal`                |         |
| `appeal:cost`         | `appealCost` (`appeal.ts`)           | — (pure, mirrors math)  |         |
| `appeal:claim-refund` | `claimAppealRefund` (`appeal.ts`)    | `claim_appeal_refund`   |   yes   |

## Settlement economics (`settle_round_accounts`, lib.rs:2651)

Each juror is judged against **`final_ruling`** (not the round's own result),
then ledger-only adjustments are written to `JurorStake` — no SPL transfer
(`staked` is never mutated; the MST accumulator root commits to it, ADR-0020).

```
slash_per_juror = alpha_bps · min_stake / 10_000        # one slash unit
coherent        = reveals[i] != u64::MAX && match aggregation (ADR-0025):
                    Plurality: reveals[i] == final_ruling
                    Median:    |reveals[i] − final_ruling| · 10_000
                               ≤ final_ruling · coherence_tol_bps
stake_pool      = Σ slashes       (stake_token)
fee_pool        = (panel − reveal_count) · fee_per_juror + forfeited_bonds  (fee_token)
```

- **Incoherent / non-revealer:** `stake_delta -= min(slash_per_juror, staked)`,
  `slash_reserve -= slash_per_juror`.
- **Coherent:** `stake_delta += stake_pool / coherent_count` (stake share),
  `fees_earned += fee_pool / coherent_count` (fee share).
- Every drawn juror: `active_draws -= 1` (releases the unstake lock).

> `forfeited_bonds` is non-zero only on the **final** round (`finalize_dispute`
> folds no-flip appeal bonds in). Prior-round `settle_round` passes `0`.

## `settle:round` — prior-round settlement

```bash
# Settle round 0 of an appealed dispute now in Final state
useaccord settle:round --dispute <addr> --round-idx 0

# Inspect what the cranker already ran, or drive it yourself on devnet
useaccord settle:round --dispute <addr> --round-idx 0 --json
```

- Gates: dispute `Final`, `round_idx < current_round`, round not yet settled.
- `remaining_accounts` = the round's panel `JurorStake` PDAs (auto-derived).
- Idempotent per round: sets `round.settled = 1`, emits `RoundSettled`.
- Reverts: `DisputeNotFinal`, `RoundNotSettlable`, `RoundAlreadySettled`.

The final round (`round_idx == current_round`) is settled by
`vote:finalize-dispute` — `settle:round` is exclusively for the overturned
prior rounds an appeal leaves behind.

## `appeal:open` — escalate to a `2N+1` panel

```bash
# Round 0 (panel 3) resolved against you; appeal to round 1 (panel 7)
useaccord appeal:open \
  --subaccord <addr> --dispute <addr> --round <addr>   # round = current_round
```

Any account may appeal (permissionless; **never pausable**, ADR-0016). The
appellant pays `fee_new + bond` from their `fee_token` ATA into the Subaccord
fee vault; an `AppealBond` PDA `["bond", dispute, current_round+1]` records the
deposit, appellant, and `prior_result` (the ruling being challenged). The
dispute resets to `Created`, `current_round` bumps, and snapshot→draw→vote
reruns for the larger panel.

- Gates: state `RoundResolved`, `now < reveal_end + appeal_window`,
  `current_round < max_appeals`, `staker_count >= panel_new`.
- Cost is exponential: `fee_new = panel_new · fee_per_juror`, `bond = fee_new`,
  **total = 2 × fee_new**.
- Reverts: `InvalidState`, `AppealWindowClosed`, `MaxAppealsReached`,
  `InsufficientJurors`.

## `appeal:cost` — pure pre-check (no send)

```bash
# Quote round 1 before paying: panel 7, fee 7000, bond 7000, total 14000
useaccord appeal:cost --current-round 0 --fee-per-juror 1000 --json
# {"newRound":1,"panel":7,"fee":7000,"bond":7000,"total":14000}
```

Mirrors on-chain cost math (`appealCost`, appeal.ts); returns `null` if panel
math overflows (`round_idx >= 31`). Use it to surface the bill to a user before
`appeal:open`, or to verify a failed appeal's rejection reason offline.

## `appeal:claim-refund` — return a flipped bond

```bash
# Cranker does this; manual claim of a flipped round-1 appeal bond
useaccord appeal:claim-refund \
  --dispute <addr> --round-idx 1 --claimant-token-account <appellant-ATA>
```

Returns a **flipped** bond after finalization. On `Final`, refunds the bond
portion (`deposit − fee_new`); on `Failed` (cancel), refunds the full deposit.
The claimant ATA's owner must equal the recorded appellant. Idempotent — the
bond is zeroed on payout. No-flip bonds are forfeited into the coherent fee
pool at `finalize_dispute` and are **not** claimable.

## Appeal ladder & worked cost example

Panel grows `N_{k+1} = 2·N_k + 1` (closed form `(J+1)·2^k − 1`, capped at
`MAX_JURORS = 31`). With `fee_per_juror = 1_000` and `max_appeals = 3`:

| From→To round | Panel | `fee_new` | `bond` | **`total` paid** |
| ------------- | ----- | --------- | ------ | ---------------- |
| 0 → 1         | 7     | 7_000     | 7_000  | **14_000**       |
| 1 → 2         | 15    | 15_000    | 15_000 | **30_000**       |
| 2 → 3         | 31    | 31_000    | 31_000 | **62_000**       |

```bash
# Full escalation playbook
useaccord appeal:cost --current-round 0 --fee-per-juror 1000      # 14000
useaccord appeal:open  --dispute <addr> --round <round0-addr>     # round 1 opens
# ... new panel votes; if still wrong, appeal again:
useaccord appeal:cost --current-round 1 --fee-per-juror 1000      # 30000
useaccord appeal:open  --dispute <addr> --round <round1-addr>     # round 2 opens
```

## H-3 — no-coherent-juror consolation (🟠 High, fixed)

When `coherent_count == 0` — rare, but typical for an overturned prior round
where every juror voted the (now-superseded) result — the fee pool would be
permanently trapped in the vault. The fix (`settle_round_accounts`, lib.rs:2704)
credits `fee_pool / panel` to **all** drawn jurors equally as a consolation
fee, instead of dividing by zero:

- `coherent_count > 0` → normal path (`stake_share`, `fee_share` per coherent juror).
- `coherent_count == 0` → `consolation_fee = fee_pool / panel` to every juror;
  the **stake pool is not redistributed** (dividing by panel would nullify the
  slash), so slashes still stand.

## Cranker notes

`settle_round` and `claim_appeal_refund` run in the Accord Cranker's
reconciler loop (`accord-27r5`). The CLI commands exist for devnet/manual
operation, inspection, and pipelines; in production they fire automatically
once a dispute reaches `Final`/`Failed`.
