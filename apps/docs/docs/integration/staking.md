# Staking as a Juror

Stake capital into a Subaccord; become draw-eligible. Capital moves between the Juror's ATA and the Subaccord-PDA-owned `stake_vault` (ADR-0020: collateral is separate from compensation `fee_token`).

## `stake(amount, leaf_path)`

- SPL transfer `juror_token_account → stake_vault`.
- Credits the **real delta** the vault received (fee-on-transfer safe: Token-2022 fees make `delta ≤ amount`).
- Caller supplies the juror's Merkle path; the chain verifies it vs the stored accumulator root, reads the **live** `JurorStake.staked`, applies the verified delta, and recomputes the root (O(log N)).
- First stake (0 → positive) appends a leaf, assigns `tree_index` (immutable), and increments `Subaccord.staker_count`.
- Reverts while paused.
- `active_draws` untouched (preserved on top-up).

## `unstake(amount, leaf_path)`

- PDA-signed transfer `stake_vault → juror_token_account`.
- Caller supplies the juror's Merkle path; root recomputed the same way as `stake`.
- Reverts while `active_draws > 0` (stake frozen until every drawn dispute settles — [ADR-0003](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0003-accord-draw-merkle-snapshot-distinct-vrf.md)).
- Caps at `JurorStake.staked`.
- **Never halted by pause** (capital is never trapped — [ADR-0007](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0007-upgrade-authority-multisig-then-freeze.md)).
- Full unstake (positive → 0) zeros the leaf (kept at zero selection weight; `tree_index` reused on re-stake) and decrements `Subaccord.staker_count`.

## `staker_count` — coarse gate only

- Counts distinct Jurors with `staked > 0`. Maintained O(1).
- **Does not** track `min_stake` eligibility (changes via timelock; recomputing needs the O(n) ledger [ADR-0003](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0003-accord-draw-merkle-snapshot-distinct-vrf.md) rejected).
- Precise eligibility (staked ≥ min_stake, distinctness) is enforced at [`draw_seat`](../security/sortition-vrf.md) against the frozen accumulator root.

## `withdraw_fees` — earned compensation (ADR-0020)

- Jurors accumulate earned fees on `JurorStake.fees_earned` (in `fee_token`), credited at `finalize_round` + settlement.
- `withdraw_fees` pulls the entire `fees_earned` balance from the Subaccord's `fee_vault` → the juror's `fee_token` ATA.
- **No `active_draws` gate, no timelock** — earned fees are not at-risk capital.

```rust
accord::stake(ctx.contexts, amount, leaf_path)?;
accord::unstake(ctx.contexts, amount, leaf_path)?;
```

```typescript
import { stake, unstake } from "@useaccord/sdk";

await stake(accord.adapter, accord.PROGRAM_ID, {
  subaccord,
  juror,
  amount,
  leafPath,
});
await unstake(accord.adapter, accord.PROGRAM_ID, {
  subaccord,
  juror,
  amount,
  leafPath,
});
```

PDA: `["stake", subaccord, juror]`. Each `JurorStake` carries a `tree_index` (its leaf position in the Subaccord accumulator, assigned at first stake). The accumulator root lives on the `Subaccord` ([ADR-0012](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)); a wrong path reverts — root integrity never depends on the caller.
