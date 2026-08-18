# @useaccord/synod

TypeScript SDK for [Accord Synod](../../programs/synod) — the N-party
dispute-escrow Arbitrable that runs on top of [Accord](../sdk).

Synod escrows equal stakes from a named 2–7 party roster, files one dispute
via CPI when the roster is full, and pays the pot to the prevailing party
from the Accord ruling (`programs/synod/SPEC.md` is the authority).

## Install

```sh
pnpm add @useaccord/synod @solana/kit
```

## Usage

```ts
import { Synod, findSynodCasePda, openCase } from "@useaccord/synod";

const synod = new Synod({ endpoint: RPC_URL, signer });

// Derive the SynodCase PDA (seeds: ["case", opener, nonce]).
const [casePda] = await findSynodCasePda({ opener, nonce: 0n });

// Build an open_case instruction (derives the case PDA).
const { instruction, case } = await openCase(
  { opener: signer, subaccord: subaccordPda },
  { parties: [partyA, partyB], stake: 1_000n, joinDeadline: deadline, nonce: 0n },
);
```

## API

### PDA helpers

- `findSynodCasePda({ opener, nonce })` — `["case", opener, nonce]`
- `findCaseVaultPda(feeMint, casePda)` — the case-PDA-owned `feeMint` ATA
  (adapter over `@useaccord/sdk`'s `findAssociatedTokenAddress`)

### Instruction facades

- `openCase(accounts, args)` — permissionless case opening; fee frozen from
  the Subaccord; derives the SynodCase PDA
- `join(accounts, { evidenceHash })` — named-party stake; derives the party
  ATA + the lazily-created case vault ATA
- `fileDispute(accounts, { nonce }, extras)` — full roster → CPI Accord
  `create_dispute` as the case PDA; the four Accord CPI-only accounts ride
  `remainingAccounts` (canon `challengeItem` pattern)
- `refundRosterMiss(accounts, { nonce })` — crank: deadline passed + roster
  incomplete → one joined party's `S` back per call
- `claim(accounts, { nonce })` — crank: Final/Failed payout pull
  (winner pot / neutral split / full `S`)

### Account fetchers

- `fetchSynodCase(synod, address)` / `fetchSynodCaseMaybe(synod, address)`
- `fetchMaybeSynodCase(rpc, address)` — standalone generated fetcher over a
  bare Kit RPC (no client/signer) — the path the jest e2e harness uses

## Build

```sh
pnpm --filter @useaccord/synod run build     # tsup (bundle) + tsc --emitDeclarationOnly
pnpm --filter @useaccord/synod run codegen    # regenerate from IDL (after anchor build)
pnpm --filter @useaccord/synod run test       # PDA/ATA smoke tests
```

## Authority

ADR-0010 (SDK facade pattern) · `programs/synod/SPEC.md` · `synod/0001`–`0002`
