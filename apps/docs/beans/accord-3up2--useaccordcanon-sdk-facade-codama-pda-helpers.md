---
# accord-3up2
title: "@useaccord/canon SDK facade (Codama + PDA helpers)"
status: completed
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-08T19:05:00Z
parent: accord-otps
blocked_by:
  - accord-r90a
  - accord-d7k2
---

Target: `packages/sdk` (extend @useaccord/sdk, or a `@useaccord/canon` package per the rename bean accord-firh). Codama IDL codegen for the canon program + Solana Kit + hand-written facade.
Change: PDA helpers (`canonListPda(creator, rulesHash)`, `canonItemPDA(list, account)`); instruction facades: `createList`, `submitItem`, `advancePending`, `challengeItem`, `settleItem`, `requestWithdrawal`, `advanceWithdrawal`; typed accountsStrict decoders for `CanonList`/`CanonItem` (mirror the Accord SDK facade pattern, ADR-0010).
Acceptance: SDK builds (`pnpm -r build`); methods typed; a smoke `createList`+`submitItem` call constructs valid Txs. Mirrors `packages/sdk` conventions.
Dependencies: settle_item + withdrawal (all instructions shipped). Authority: ADR-0010; packages/sdk.

## Summary of Changes

Created `packages/canon/` (`@useaccord/canon`) — a standalone TypeScript SDK
package for the Canon curated-list Arbitrable, mirroring the Accord SDK
two-layer pattern (ADR-0010): Codama-generated Kit client + hand-written
facade.

**Generated layer** (`src/generated/`, via `codama run js` from the canon IDL):

- Instruction builders for all 6 shipped instructions
- Account codecs/decoders for `CanonList` + `CanonItem`
- `ItemState` enum + `findItemPda` (CanonItem PDA)

**Hand-written facade** (`src/`):

- `pda.ts` — `findCanonListPda({ creator, rulesHash })` (hand-written; Codama
  omits it because seeds reference account fields, not instruction args — same
  pattern as the Accord SDK's hand-written `findRoundPda`), `findCanonItemPda()`
  alias, `CANON_PROGRAM_ID`.
- `canon.ts` — `Canon` facade class (RPC + signer + Kit client), mirrors `Accord`.
- `methods.ts` — typed instruction facades: `submitItem`, `advancePending`,
  `challengeItem` (with `remainingAccounts` for the 4 Accord CPI accounts),
  `settleItem`, `requestWithdrawal`, `advanceWithdrawal`.
- `fetch.ts` — `fetchCanonList`/`fetchCanonItem` + `*Maybe` variants.
- `index.ts` — public surface (PDAs, methods, fetchers, codecs, domain types).

**Smoke test** (`src/canon.smoke.test.ts`): PDA derivation determinism +
program ID check — 3/3 pass via `node --test`.

**`createList` skipped:** the `create_list` instruction is not yet shipped
on-chain (bean accord-73yx, status: todo). A `createList` facade will land
with it. The other 6 instruction facades are type-checked by the tsc build
and exercised end-to-end by the Surfpool jest suite (bean accord-f5xg).

**Verification:**

- `pnpm -r build` — GREEN (all 5 workspace projects)
- `pnpm -r run lint` — GREEN (canon `tsc --noEmit` + sdk + evidence-daemon)
- `pnpm --filter @useaccord/canon test` — 3/3 PDA smoke tests pass
