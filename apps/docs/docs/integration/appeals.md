# Appeals

Permissionless escalation to a larger panel. Anyone may appeal a resolved round within the appeal window.

## `appeal()`

| Gate                                    | Error                |
| --------------------------------------- | -------------------- |
| `!pause_state.paused`                   | `ProgramPaused`      |
| `state == RoundResolved`                | `InvalidState`       |
| `current_round < max_appeals`           | `MaxAppealsReached`  |
| `now < reveal_end + APPEAL_WINDOW_SECS` | `AppealWindowClosed` |
| `subaccord.staker_count ≥ new_panel`    | `InsufficientJurors` |

## Panel ladder

Closed form `panel_k = (J+1)·2^k − 1`, capped at `MAX_JURORS (31)`.

| `current_round` (after++) | panel (J=3) |
| ------------------------- | ----------- |
| 1                         | 7           |
| 2                         | 15          |
| 3                         | 31          |

## Cost

```
fee_new = panel_new × fee_per_juror
bond    = fee_new                         // bond == new-round fee
total   = fee_new + bond                  // appellant ATA → vault
```

## Bond settlement

- Recorded in `AppealBond` PDA `["bond", dispute, round_idx]` where `round_idx` = the new (larger) round.
- `prior_result` = winner of the round being appealed.
- `finalize_dispute` checks each bond: `prior_result == final_ruling` ⇒ **no flip** ⇒ bond folded into the final-round coherent pool and zeroed. `prior_result != final_ruling` ⇒ **flip** ⇒ bond left for `claim_appeal_refund`.
- `claim_appeal_refund` returns flipped bonds to their appellant (idempotent).

## Round reset

`appeal` increments `current_round` and resets `state → Created`, so the VRF → draw → vote cycle reruns for the larger panel. The same `committed_vrf` and `frozen_root` are reused — appeals draw a larger panel from the same fixed pool (no new VRF, no re-grind; [ADR-0012](../adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).

```rust
accord::appeal(ctx.contexts)?;
// later, after Final:
accord::claim_appeal_refund(ctx.contexts, round_idx)?;  // round_idx = appealed round
```

```typescript
import { appeal, claimAppealRefund } from "@useaccord/sdk";

await appeal(accord.adapter, accord.PROGRAM_ID, { dispute });
// after finalize_dispute:
await claimAppealRefund(accord.adapter, accord.PROGRAM_ID, {
  dispute,
  roundIdx,
});
```

Why permissionless + bond economics: [ADR-0004](../adr/0004-accord-party-agnostic-permissionless-appeal.md). Cross-round settlement against the final ruling: Kleros §4.6.
