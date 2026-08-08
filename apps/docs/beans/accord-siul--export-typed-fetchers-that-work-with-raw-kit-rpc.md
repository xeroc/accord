---
# accord-siul
title: Export typed fetchers that work with raw Kit RPC
status: completed
type: task
created_at: 2026-08-07T23:08:48Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-mpjd
---

The generated accounts modules already export fetchSubaccord(rpc, address) etc. that work with a raw Kit RPC. The SDK's fetch.ts wrappers route through accord.client which has the ClientWithRpc type issue. Fix: either export the generated fetch functions directly from index.ts, or rewrite fetch.ts wrappers to accept an RPC parameter. Frontend must get typed Account<T> back, never raw bytes.

## Summary of Changes

Rewrote `packages/sdk/src/fetch.ts` from hand-written facade-delegate wrappers
(`fetchX(accord, address)` → `accord.client.accord.accounts.X.fetch`) into
clean re-exports of the generated fetchers, which take a raw Kit `Rpc`:

```
export { fetchSubaccord, fetchMaybeSubaccord as fetchSubaccordMaybe } from "./generated/accounts/subaccord.js";
```

All seven account types (Subaccord, JurorStake, Dispute, Round, PendingUpdate,
AppealBond, PauseState) now expose `fetchX(rpc, address)` and
`fetchXMaybe(rpc, address)` — working over a bare `createSolanaRpc(...)` or
`Accord#rpc`, with no `ClientWithRpc` dependency. The public API names are
preserved exactly (`fetchXMaybe` aliases the generated `fetchMaybeX`), so
`index.ts` needed no change.

Updated the two call sites that passed the facade as the first arg:

- `apps/evidence-daemon/src/chain/reader.ts` (3 calls → `accord.rpc`).
- `tests/src/e2e.test.ts` (2 calls → `accord.rpc`).

The adapter's seam methods (`adapter.fetchDispute` etc. in `adapter.ts`) are
unaffected — they read via `accord.client...fetchMaybe` directly and are only
ever used through a fully-wired `Accord` instance.

Verification: `@useaccord/sdk` lint clean + 66 tests (64 pass; 2 pre-existing
`staking.test.ts` failures untouched); `@useaccord/evidence-daemon` typecheck
clean; `@useaccord/tests` typecheck clean.
