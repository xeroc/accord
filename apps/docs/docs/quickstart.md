# Quickstart

File a dispute and read the ruling from your Solana program in 5 minutes.

## Prerequisites

- An Anchor program (your Arbitrable)
- A Subaccord to file into (use an existing one or [create your own](integration/subaccords.md))
- SPL tokens for the dispute fee

## The Arbitrable interface

Your program needs exactly two CPI calls:

```rust
// 1. File the dispute
let dispute = accord::create_dispute(
    ctx.accounts.clone(),
    vec![option_a_hash, option_b_hash], // 2..=8 option hashes (Plurality); scalar Median pools file none
    evidence_hash,                       // commitment to the evidence
    nonce,                               // caller-chosen, for PDA uniqueness
    fee,                                 // INITIAL_NUM_JURORS (3) * fee_per_juror
)?;

// 2. Read the ruling (lazy — call whenever, after finalization)
let ruling: Option<u64> = accord::get_ruling( // option index, or the median for scalar pools (ADR-0025)
    ctx.accounts.dispute
)?;
```

That's it. The Accord handles juror selection, voting, and finalization.

## TypeScript SDK

```typescript
import { Accord } from "@useaccord/sdk";

// File a dispute
const { dispute } = await accord.createDispute({
  subaccord: subaccordAddress,
  options: [hashOption("Yes"), hashOption("No")],
  evidenceHash: evidenceCommitment,
  nonce: 1n,
  fee: requiredFee,
});

// Later: read the ruling
const ruling = await accord.getRuling(dispute);
if (ruling !== null) {
  console.log("Winner:", ruling); // 0 = option A, 1 = option B
}
```

## Lifecycle

```
create_dispute → request_vrf → commit_vrf_callback (freezes root)
  → draw_seat × N → commit → reveal → finalize_round
  → finalize_dispute → get_ruling
```

Most steps are permissionless cranks — anyone can advance them. Your program
only calls `create_dispute` and `get_ruling`.

## Next

- [Integration Guide](integration/index.md) — full step-by-step
- [Protocol Reference](reference/index.md) — every account and instruction
