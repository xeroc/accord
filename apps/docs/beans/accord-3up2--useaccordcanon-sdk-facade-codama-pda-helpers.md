---
# accord-3up2
title: '@useaccord/canon SDK facade (Codama + PDA helpers)'
status: todo
type: task
priority: high
created_at: 2026-08-07T23:01:23Z
updated_at: 2026-08-07T23:01:23Z
parent: accord-otps
blocked_by:
    - accord-r90a
    - accord-d7k2
---

Target: `packages/sdk` (extend @useaccord/sdk, or a `@useaccord/canon` package per the rename bean accord-firh). Codama IDL codegen for the canon program + Solana Kit + hand-written facade.
Change: PDA helpers (`canonListPda(creator, rulesHash)`, `canonItemPDA(list, account)`); instruction facades: `createList`, `submitItem`, `advancePending`, `challengeItem`, `settleItem`, `requestWithdrawal`, `advanceWithdrawal`; typed accountsStrict decoders for `CanonList`/`CanonItem` (mirror the Accord SDK facade pattern, ADR-0010).
Acceptance: SDK builds (`pnpm -r build`); methods typed; a smoke `createList`+`submitItem` call constructs valid Txs. Mirrors `packages/sdk` conventions.
Dependencies: settle_item + withdrawal (all instructions shipped). Authority: ADR-0010; packages/sdk.
