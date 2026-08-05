# Staking as a Juror

Stake capital into a Subaccord; become draw-eligible. Capital moves between the Juror's ATA and the Subaccord-PDA-owned vault.

## `stake(amount)`

- SPL transfer `juror_token_account → vault`.
- Credits the **real delta** the vault received (fee-on-transfer safe: Token-2022 fees make `delta ≤ amount`).
- First stake (0 → positive) increments `Subaccord.staker_count`.
- Reverts while paused.
- `active_draws` untouched (preserved on top-up).

## `unstake(amount)`

- PDA-signed transfer `vault → juror_token_account`.
- Reverts while `active_draws > 0` (stake frozen until every drawn dispute settles — [ADR-0003](../adr/0003-accord-draw-merkle-snapshot-distinct-vrf.md)).
- Caps at `JurorStake.amount`.
- **Never halted by pause** (capital is never trapped — [ADR-0007](../adr/0007-upgrade-authority-multisig-then-freeze.md)).
- Full unstake (positive → 0) decrements `Subaccord.staker_count`.

## `staker_count` — coarse gate only

- Counts distinct Jurors with `amount > 0`. Maintained O(1).
- **Does not** track `min_stake` eligibility (changes via timelock; recomputing needs the O(n) ledger [ADR-0003](../adr/0003-accord-draw-merkle-snapshot-distinct-vrf.md) rejected).
- Precise eligibility (amount ≥ min_stake, distinctness) is enforced at [`draw`](../security/sortition-vrf.md) against the finalized snapshot.

```rust
accord::stake(ctx.contexts, amount)?;
accord::unstake(ctx.contexts, amount)?;
```

```typescript
import { stake, unstake } from "@accord/sdk";

await stake(accord.adapter, accord.PROGRAM_ID, { subaccord, juror, amount });
await unstake(accord.adapter, accord.PROGRAM_ID, { subaccord, juror, amount });
```

PDA: `["stake", subaccord, juror]`. Anchor-slot witness `last_change_slot` underpins the snapshot fraud model ([ADR-0008](../adr/0008-snapshot-trust-hardening-anchor-slot-and-verifiable-sortition.md)).
