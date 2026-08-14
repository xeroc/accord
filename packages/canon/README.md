# @useaccord/canon

TypeScript SDK for [Accord Canon](../../programs/canon) — the curated-list
Arbitrable that runs on top of [Accord](../sdk).

Canon owns the item lifecycle + item deposits; Accord owns juror staking, the
VRF draw, commit-reveal voting, and the ruling. When an item is challenged,
Canon files a dispute via CPI and reads the ruling to flip item status.

## Install

```sh
pnpm add @useaccord/canon @solana/kit
```

## Usage

```ts
import { Canon, findCanonListPda, submitItem } from "@useaccord/canon";

const canon = new Canon({ endpoint: RPC_URL, signer });

// Derive the CanonList PDA (seeds: ["canon", creator, rules_hash]).
const [listPda] = await findCanonListPda({ creator, rulesHash });

// Build a submit_item instruction.
const { instruction, item } = await submitItem(
  {
    submitter: signer,
    list: listPda,
    account: curatedAddress,
    feeMint,
    submitterTokenAccount,
    vault,
  },
  { evidence: hash32, deposit: 500n },
);
```

## API

### PDA helpers

- `findCanonListPda({ creator, rulesHash })` — `["canon", creator, rules_hash]`
- `findCanonItemPda(list, account)` — `["canon-item", list, account]`

### Instruction facades

- `createList(accounts, args)` — permissionless list creation; CPIs Accord
  `create_subaccord` for the 1:1 backing court. `accounts`:
  `{ creator, stakeMint, feeMint }`; `args`: `{ listProgram, rulesHash,
  submitDeposit, challengePct, listingWindow, withdrawalTimelock }`
- `submitItem(accounts, { evidence, deposit })` — permissionless item submission
- `advancePending({ caller, list, item })` — crank: Pending → Listed
- `challengeItem(accounts, { evidence }, extras)` — lock stake + fee, CPI Accord
- `settleItem(accounts)` — crank: read ruling, redistribute
- `requestWithdrawal({ submitter, list, item })` — submitter-only; Listed → WithdrawPending
- `advanceWithdrawal(accounts)` — crank: return stake, item → Removed

### Account fetchers

- `fetchCanonList(canon, address)` / `fetchCanonListMaybe(canon, address)`
- `fetchCanonItem(canon, address)` / `fetchCanonItemMaybe(canon, address)`

## Build

```sh
pnpm --filter @useaccord/canon run build     # tsup (bundle) + tsc --emitDeclarationOnly
pnpm --filter @useaccord/canon run codegen    # regenerate from IDL (after anchor build)
pnpm --filter @useaccord/canon run test       # PDA smoke tests
```

## Authority

ADR-0010 (SDK facade pattern) · `programs/canon/SPEC.md` · `canon-0001`
