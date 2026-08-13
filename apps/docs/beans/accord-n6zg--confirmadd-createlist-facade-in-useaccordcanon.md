---
# accord-n6zg
title: Confirm/add createList facade in @useaccord/canon
status: completed
type: task
created_at: 2026-08-13T02:08:01Z
updated_at: 2026-08-13T04:35:00Z
parent: accord-pzhs
---

FIRST: verify @useaccord/canon exports a usable createList (SDK README flagged it not-yet-shipped). If missing, add to packages/canon/src/methods.ts + regenerate. DoD: createList(accounts,args) builds the instruction. see milestone §2, §7 open Q.

## Summary of Changes

**Verification only — no code changes.** The `createList` facade was already
shipped (commit 58c0580: "feat(canon): createList facade + challenge→settle e2e").

### Confirmed

- `packages/canon/src/methods.ts` exports `createList(accounts: CreateListAccounts,
  args: CreateListArgs)` returning `{ instruction, list, subaccord }`.
- `CreateListAccounts`: `{ creator: TransactionSigner, stakeMint: Address,
  feeMint: Address }`.
- `CreateListArgs`: `{ listProgram, rulesHash, submitDeposit, challengePct,
  listingWindow, withdrawalTimelock }`.
- Re-exported from `packages/canon/src/index.ts` (public SDK surface).
- **Consumed and verified**: `apps/canon/src/features/list/CreateListPage.tsx`
  imports and calls `createList` from `@useaccord/canon` — the app lints clean
  and builds green (accord-fx93).

No addition or regeneration was needed.
