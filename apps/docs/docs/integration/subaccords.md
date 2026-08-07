# Subaccords

A specialized Juror pool. Permissionless to create; one per `(creator, risk_type)`.

## `create_subaccord` params

| Param               | Type          | Notes                                                                                                                                                                                      |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `risk_type`         | `[u8; 32]`    | Immutable identity hash. `!= [0;32]`. Namespaces the PDA.                                                                                                                                  |
| `evidence_spec`     | `[u8; 32]`    | Immutable evidence-format hash. [ADR-0006](../adr/0006-evidence-onchain-hash-trusted-re-encryption-operator.md)                                                                            |
| `staking_token`     | `Pubkey`      | SPL mint for juror capital. [ADR-0002](../adr/0002-per-subaccord-staking-token-no-accord-token-v1.md)                                                                                      |
| `min_stake`         | `u64`         | Draw eligibility threshold (in `staking_token`).                                                                                                                                           |
| `aggregation`       | `Aggregation` | Dispute-kit tally rule (v1 = `Plurality`). [ADR-0019](../adr/0019-subaccord-dispute-kit-aggregation-enum-fixed-panel-ladder.md)                                                            |
| `alpha_bps`         | `u16`         | Slash factor in bps. `loss = alpha_bps · min_stake / 10_000`.                                                                                                                              |
| `review_window`     | `u64`         | seconds                                                                                                                                                                                    |
| `commit_window`     | `u64`         | seconds                                                                                                                                                                                    |
| `reveal_window`     | `u64`         | seconds                                                                                                                                                                                    |
| `max_appeals`       | `u8`          | `≤ MAX_APPEALS (3)`. The sole panel-shape knob — round-1 size is the fixed `INITIAL_NUM_JURORS` (=3). [ADR-0019](../adr/0019-subaccord-dispute-kit-aggregation-enum-fixed-panel-ladder.md) |
| `fee_per_juror`     | `u64`         | in `staking_token`.                                                                                                                                                                        |
| `authority`         | `Pubkey`      | `Pubkey::default()` ⇒ immutable. Else signs propose/execute.                                                                                                                               |
| `evidence_operator` | `Pubkey`      | [ADR-0006](../adr/0006-evidence-onchain-hash-trusted-re-encryption-operator.md) re-encryption service.                                                                                     |

## PDA

```
["subaccord", creator, risk_type]
```

## Mutability

- Immutable: `risk_type`, `evidence_spec`.
- Mutable only via 48h timelock (`propose_subaccord_update` → `execute_subaccord_update`): `min_stake`, `alpha_bps`, `review/commit/reveal_window`, `max_appeals`, `fee_per_juror`, `authority`, `evidence_operator`. Round-1 panel size is not configurable (fixed `INITIAL_NUM_JURORS` = 3); `aggregation` is immutable ([ADR-0019](../adr/0019-subaccord-dispute-kit-aggregation-enum-fixed-panel-ladder.md)).
- `authority == Pubkey::default()` ⇒ `propose_subaccord_update` reverts with `ImmutableSubaccord`.

```rust
accord::create_subaccord(
    ctx,
    risk_type, evidence_spec, staking_token, min_stake,
    alpha_bps,
    review_window, commit_window, reveal_window,
    max_appeals, aggregation, fee_per_juror,
    authority,                  // Pubkey::default() => immutable
    evidence_operator,
)?;
```

```typescript
import { createSubaccord, findSubaccordPda, Aggregation } from "@accord/sdk";

const [subaccord] = await findSubaccordPda(
  accord.PROGRAM_ID,
  creator,
  riskType, // 32-byte hash
);
await createSubaccord(accord.adapter, accord.PROGRAM_ID, {
  creator,
  riskType,
  evidenceSpec,
  stakingToken,
  minStake,
  aggregation: Aggregation.Plurality,
  alphaBps,
  reviewWindow,
  commitWindow,
  revealWindow,
  maxAppeals,
  feePerJuror,
  authority,
  evidenceOperator,
});
```

Why: [ADR-0005](../adr/0005-subaccord-authority-pubkey-timelock.md). Param update flow: [ADR-0005](../adr/0005-subaccord-authority-pubkey-timelock.md), [instructions](../reference/instructions.md).
