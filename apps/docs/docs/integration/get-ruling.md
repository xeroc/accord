# Reading the Ruling

`get_ruling` — read-only CPI. The Arbitrable polls lazily.

## Return

```rust
pub fn get_ruling(ctx: Context<GetRuling>) -> Result<Option<u64>>
// Ok(None)  until state == Final
// Ok(Some(r)) the ruling: for Plurality, the winning option index
//             (0 <= r < num_options as u64); for Median, the final median —
//             a u64 fixed-point scalar (ADR-0025)
```

## Finality

`final_ruling` is set only by `finalize_dispute`, which requires:

- `state == RoundResolved`, and
- `now ≥ reveal_end + terms.appeal_window` (no further appeal possible; per-Subaccord, [ADR-0022](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0022-per-subaccord-configurable-appeal-window.md)).

So a ruling is final iff the appeal window has elapsed on the last round with no appeal landed. Polling earlier than that returns `None`.

## Poll pattern

```rust
match accord::cpi::get_ruling(cpi_ctx)? {
    None => return Err(MyError::DisputeNotFinal.into()),
    Some(winner) => /* apply winner to your protocol */,
}
```

```typescript
import { fetchDisputeMaybe } from "@useaccord/sdk";

const d = await fetchDisputeMaybe(accord, dispute);
if (d?.exists && d.data.finalRuling !== null) {
  const winner = d.data.finalRuling; // bigint | number — u64 (option index, or median for scalar pools)
}
```

## What `winner` means

Depends on the pool's `aggregation`:

- **`Plurality`:** an index into the `options` array the filer passed to
  [`create_dispute`](disputes.md). The Arbitrable defines what each hash means;
  the Accord only returns the index.
- **`Median` (scalar, [ADR-0025](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0025-scalar-voting.md)):
  the final median — a u64 fixed-point value in the settlement mint's base
  units (e.g. 6 decimals for USDC). The dispute filed **zero** options; the
  Arbitrable applies the mint's decimals to interpret the amount.

State gate detail: [state machine](../reference/state-machine.md). Two-call model: [ADR-0004](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0004-accord-party-agnostic-permissionless-appeal.md).
