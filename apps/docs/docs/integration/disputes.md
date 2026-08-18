# Filing a Dispute

The Arbitrable's only write into the Accord. `create_dispute` custodies the round-0 fee and opens a `Dispute` PDA.

## Args

| Arg             | Type            | Notes                                                                                                                                                                                                                        |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`       | `Vec<[u8; 32]>` | **Plurality:** `2..=MAX_OPTIONS` (8) option label hashes. **Median (scalar):** empty — the dispute carries no options; votes are u64 fixed-point scalars ([ADR-0025](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0025-scalar-voting.md)). |
| `evidence_hash` | `[u8; 32]`      | [ADR-0006](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0006-evidence-onchain-hash-trusted-re-encryption-operator.md) commitment. Stored at `dispute.evidence_hashes[0]`; appeals may add per-round hashes ([ADR-0023](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0023-per-round-evidence-hashes.md)). |
| `nonce`         | `u64`           | Caller-chosen; PDA uniqueness (`["dispute", filer, nonce]`).                                                                                                                                                                 |
| `fee`           | `u64`           | **Must equal** `INITIAL_NUM_JURORS · fee_per_juror` (= `3 · fee_per_juror`).                                                                                                                                                 |

## Gates

| Gate                                          | Error                |
| --------------------------------------------- | -------------------- |
| `!pause_state.paused`                         | `ProgramPaused`      |
| options gate: Plurality `2 ≤ len ≤ 8`, Median `len == 0` | `InvalidOptions` |
| `fee == INITIAL_NUM_JURORS · fee_per_juror`   | `FeeMismatch`        |
| `subaccord.staker_count ≥ INITIAL_NUM_JURORS` | `InsufficientJurors` |

## Fee

```
fee = INITIAL_NUM_JURORS × fee_per_juror      // = 3 × fee_per_juror (ADR-0019); moves filer ATA → vault
```

The fee is authoritative on-chain: the filer signs the exact charge. Appeal-round fees are paid by the appellant ([appeals](appeals.md)).

```rust
let required_fee = 3u64 * subaccord.fee_per_juror; // INITIAL_NUM_JURORS (ADR-0019)
accord::cpi::create_dispute(
    cpi_ctx,
    vec![option_a_hash, option_b_hash],
    evidence_hash,
    nonce,
    required_fee,
)?;
// dispute PDA = ["dispute", filer, nonce]
```

```typescript
import { createDispute, findDisputePda } from "@useaccord/sdk";

const { instruction, dispute } = await createDispute(
  accord.adapter,
  accord.PROGRAM_ID,
  {
    subaccord,
    filer: payer.address,
    options: [hA, hB],
    evidenceHash,
    fee: requiredFee,
  },
);
```

State after: `Created`. Next crank step: [`request_vrf`](draw-voting.md) (VRF commit freezes `dispute.frozen_root`). Why party-agnostic: [ADR-0004](https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0004-accord-party-agnostic-permissionless-appeal.md).
