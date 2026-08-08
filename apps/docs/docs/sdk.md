# SDK

`@useaccord/sdk` — TypeScript facade over the Accord. Solana Kit + Codama codegen, no `@coral-xyz/anchor` runtime, no `@solana/web3.js`. Why: [ADR-0010](adr/0010-sdk-codama-solana-kit-facade.md).

## Install

```bash
pnpm add @useaccord/sdk @solana/kit
```

## Initialize

```typescript
import { Accord } from "@useaccord/sdk";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { readFileSync } from "node:fs";

const signer = await createKeyPairSignerFromBytes(
  new Uint8Array(JSON.parse(readFileSync("~/.config/solana/id.json", "utf-8"))),
);

const accord = new Accord({
  endpoint: process.env.RPC_URL!, // local validator or Solana RPC
  signer,
});
```

## Arbitrable CPI

```typescript
import { createDispute, fetchDisputeMaybe } from "@useaccord/sdk";

// 1. File
const { instruction, dispute } = await createDispute(
  accord.adapter,
  accord.PROGRAM_ID,
  { subaccord, filer: payer.address, options, evidenceHash, fee },
);

// 2. Read (lazy — null until Final)
const d = await fetchDisputeMaybe(accord, dispute);
if (d?.exists) {
  console.log(d.data.finalRuling); // bigint | null
}
```

See [Arbitrable interface](integration/arbitrable-interface.md) and [reading the ruling](integration/get-ruling.md).

## Method groups

```typescript
// Subaccord lifecycle + circuit breaker
import { createSubaccord, initializePause, pause } from "@useaccord/sdk";

// Staking
import { stake, unstake } from "@useaccord/sdk";

// Dispute filing
import { createDispute } from "@useaccord/sdk";

// VRF + per-seat draw (ADR-0012 accumulator)
import { requestVrf, drawSeat, resolveSeat } from "@useaccord/sdk";

// Commit-reveal voting
import { commit, reveal, commitHash } from "@useaccord/sdk";

// Appeals
import { appeal, claimAppealRefund } from "@useaccord/sdk";
```

## PDA helpers

```typescript
import {
  findSubaccordPda,
  findDisputePda,
  findJurorStakePda,
  findPauseStatePda,
} from "@useaccord/sdk";

const [pda] = await findSubaccordPda(accord.PROGRAM_ID, creator, riskType);
```

Seeds reference: [accounts](reference/accounts.md), [constants](reference/constants.md).

## Client-side crypto

- **Commit hash:** `sha256(vote_byte | salt[32] | juror_pubkey[32])` — matches the program's `hashv`.
- **Subtree-sum MST:** `buildAccumulator` + `proveMembership` produce the `JurorMembership` struct `draw_seat` verifies against `dispute.frozen_root`. Internal node = `H(left_hash ‖ left_sum ‖ right_hash ‖ right_sum)`; sums bound into hashes ([ADR-0012](adr/0012-on-chain-stake-accumulator-replaces-optimistic-snapshot.md)).
- **Per-seat resolution:** `resolveSeat` returns one seat's membership from the frozen root + committed VRF. The draw is one tx per seat (the 1232-byte packet can't hold N proofs); sampling is deterministic without replacement (no `draw_attempt` grind).

```typescript
import {
  commitHash,
  buildAccumulator,
  proveMembership,
  resolveSeat,
} from "@useaccord/sdk";

const commitment = commitHash(vote, salt, jurorPubkey);
const { root, totalStake } = buildAccumulator(jurors); // {juror, stake}[] — off-chain mirror of the on-chain root
const membership = await resolveSeat(frozenRoot, committedVrf, seatIndex);
```

## Build from source

```bash
make codegen   # anchor build --ignore-keys -> IDL -> Codama client
make sdk       # tsc build the SDK package
make lint      # typecheck
```

`src/generated/` is committed; regenerate via `make codegen` after program changes.
