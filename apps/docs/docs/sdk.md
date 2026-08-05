# SDK

`@accord/sdk` — TypeScript facade over the Accord. Solana Kit + Codama codegen, no `@coral-xyz/anchor` runtime, no `@solana/web3.js`. Why: [ADR-0010](adr/0010-sdk-codama-solana-kit-facade.md).

## Install

```bash
pnpm add @accord/sdk @solana/kit
```

## Initialize

```typescript
import { Accord } from "@accord/sdk";
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
import { createDispute, fetchDisputeMaybe } from "@accord/sdk";

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
import { createSubaccord, initializePause, pause } from "@accord/sdk";

// Staking
import { stake, unstake } from "@accord/sdk";

// Dispute filing
import { createDispute } from "@accord/sdk";

// Snapshot trust (ADR-0009 sortition)
import { postSnapshot, challengeSnapshot, finalizeSnapshot } from "@accord/sdk";

// VRF + draw
import { requestVrf, draw, resolvePanel } from "@accord/sdk";

// Commit-reveal voting
import { commit, reveal, commitHash } from "@accord/sdk";

// Appeals
import { appeal, claimAppealRefund } from "@accord/sdk";
```

## PDA helpers

```typescript
import {
  findSubaccordPda,
  findDisputePda,
  findJurorStakePda,
  findPauseStatePda,
} from "@accord/sdk";

const [pda] = await findSubaccordPda(accord.PROGRAM_ID, creator, riskType);
```

Seeds reference: [accounts](reference/accounts.md), [constants](reference/constants.md).

## Client-side crypto

- **Commit hash:** `sha256(vote_byte | salt[32] | juror_pubkey[32])` — matches the program's `hashv`.
- **Merkle-Sum Tree:** `buildMst` + `proveMembership` + `selectSlot` produce the `JurorMembership` structs `draw` verifies ([ADR-0009](adr/0009-stake-weighted-verifiable-sortition-mst-committed-vrf.md)).
- **Panel resolution:** `resolvePanel` retries on collision using the committed VRF, incrementing `draw_attempt` without re-requesting randomness.

```typescript
import { commitHash, buildMst, resolvePanel } from "@accord/sdk";

const commitment = commitHash(vote, salt, jurorPubkey);
const { root, totalStake } = buildMst(jurors); // {juror, stake}[]
const memberships = await resolvePanel(snapshot, vrf, 0); // draw_attempt=0
```

## Build from source

```bash
make codegen   # anchor build -> IDL -> Codama client
make sdk       # tsc build the SDK package
make lint      # typecheck
```

`src/generated/` is committed; regenerate via `make codegen` after program changes.
