# @veridao/sdk

TypeScript SDK for the **VeriDAO Accord** — a Schelling-point arbitration
primitive on Solana (Anchor). Any program (the _Arbitrable_) files a Dispute
via CPI; the Accord draws stake-weighted Jurors (Switchboard VRF), collects
commit-reveal votes, and emits a Ruling the filer reads lazily.

Built on [Solana Kit](https://github.com/anza-xyz/kit) (`@solana/kit`) with a
[Codama](https://github.com/codama-idl/codama)-generated client + a hand-written
`Accord` facade. No `@coral-xyz/anchor` runtime, no `@solana/web3.js`.

> **Architecture spec:** [ADR-0010](../apps/docs/docs/adr/0010-sdk-codama-solana-kit-facade.md)

## Install

```bash
pnpm add @veridao/sdk @solana/kit
```

## Quick start

```typescript
import { Accord } from "@veridao/sdk";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { readFileSync } from "node:fs";

const signer = await createKeyPairSignerFromBytes(
  new Uint8Array(JSON.parse(readFileSync("~/.config/solana/id.json", "utf-8"))),
);

const accord = new Accord({
  endpoint: process.env.RPC_URL!, // e.g. local validator or Solana RPC
  signer,
});
```

## Arbitrable CPI API

The two-method surface for programs that want dispute resolution:

```typescript
// File a dispute (the Arbitrable calls this via CPI)
import { createDispute } from "@veridao/sdk";
const { instruction, dispute } = await createDispute(
  accord.adapter,
  accord.PROGRAM_ID,
  { subaccord, filer: payer.address, options: 2, evidenceHash, fee },
);

// Read the ruling (lazy — returns null until finalized)
import { fetchDisputeMaybe } from "@veridao/sdk";
const disputeAccount = await fetchDisputeMaybe(accord, dispute);
if (disputeAccount?.exists) {
  console.log(disputeAccount.data.finalRuling); // bigint | null
}
```

## Method groups

The `methods` namespace covers all eight instruction groups. Each returns a Kit
`Instruction` — the caller signs and sends it.

```typescript
// Subaccord lifecycle + circuit breaker
import { createSubaccord, initializePause, pause } from "@veridao/sdk";

// Staking
import { stake, unstake } from "@veridao/sdk";

// Dispute filing
import { createDispute } from "@veridao/sdk";

// Snapshot trust (ADR-0009 sortition)
import {
  postSnapshot,
  challengeSnapshot,
  finalizeSnapshot,
} from "@veridao/sdk";

// VRF + draw
import { requestVrf, draw, resolvePanel } from "@veridao/sdk";

// Commit-reveal voting
import { commit, reveal, commitHash } from "@veridao/sdk";

// Appeals
import { appeal, claimAppealRefund } from "@veridao/sdk";
```

## PDA helpers

```typescript
import {
  findSubaccordPda,
  findDisputePda,
  findJurorStakePda,
  findPauseStatePda,
} from "@veridao/sdk";

const [pda] = await findSubaccordPda(accord.PROGRAM_ID, creator, riskType);
```

## Client-side crypto

The SDK implements the off-chain logic that supports on-chain verification:

- **Commit hash:** `sha256(vote_byte | salt[32] | juror_pubkey[32])` — matches
  the program's `hashv` on-chain.
- **Merkle-Sum Tree:** `buildMst` + `proveMembership` + `selectSlot` produce the
  `JurorMembership` structs the `draw` instruction verifies (ADR-0009).
- **Panel resolution:** `resolvePanel` retries on collision using the committed
  VRF, incrementing `draw_attempt` without re-requesting randomness.

## Building from source

```bash
make codegen   # anchor build --ignore-keys -> IDL -> Codama client
make sdk       # tsc build the SDK package
make lint      # typecheck
```

`src/generated/` is committed; regenerate via `make codegen` after program changes.

## License

MIT
