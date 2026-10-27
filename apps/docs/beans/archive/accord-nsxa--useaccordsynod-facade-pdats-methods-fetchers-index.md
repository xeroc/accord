---
# accord-nsxa
title: '@useaccord/synod facade — pda.ts, methods, fetchers, index'
status: completed
type: task
created_at: 2026-08-18T05:28:56Z
updated_at: 2026-08-18T15:08:06Z
parent: accord-e4up
blocked_by:
    - accord-8y6m
---

assigned: implementer
Hand-written surface over the generated client, mirroring the canon facade layout: pda.ts (synodCasePda [+ vault ATA helper via Kit getProgramDerivedAddress — NOT @solana/spl-token, jest breaks on uuid ESM]), methods (openCase, join, fileDispute, refundRosterMiss, claim), typed fetchers that work with raw Kit RPC (canon/accord precedent — setup/assertions depends on this), index exports. Unit tests per package test script. accountsStrict() style. See milestone accord-oylq HANDOFF §2/§3.

## Summary of Changes

- `src/pda.ts` — `findSynodCasePda` (re-export of generated `findCasePda`, seeds `["case", opener, nonce]`), `SYNOD_PROGRAM_ID`/`ACCORD_PROGRAM_ID` sourced from generated/`@useaccord/sdk`, and `findCaseVaultPda(feeMint, casePda)` — thin adapter over the SDK's `findAssociatedTokenAddress` (Kit `getProgramDerivedAddress`; no `@solana/spl-token`).
- `src/methods.ts` — all five facades (`openCase`, `join`, `fileDispute`, `refundRosterMiss`, `claim`) over the sync generated builders. Canonical addresses derived in-facade (case PDA, case vault ATA, join party ATA — all constraint-pinned on-chain); non-canonical stay explicit (refund/claim `partyTokenAccount`, claim `dispute`). `fileDispute` appends the four Accord CPI-only accounts as `remainingAccounts` with canon-`challengeItem` roles/order (matches `file_dispute.rs rem[0..3]`).
- `src/synod.ts` — `Synod` class + `SynodConfig`; `SynodClient` published as a named `ExtendedClient<SynodPluginRequirements, { synod: SynodPlugin }>` (no `ReturnType<typeof …>` alias).
- `src/fetch.ts` — `fetchSynodCase`/`fetchSynodCaseMaybe` over the plugin client; standalone bare-RPC `fetchMaybeSynodCase` re-exported from `index.ts` (the e2e `fetchDecoded` path — accord-8pd1 contract).
- `src/index.ts` — canon-shaped barrel (cherry-picked generated exports: codec/decoder/discriminator, `SynodCase` type, `CaseState` enum); dropped the stub `export *` barrel.
- `src/synod.smoke.test.ts` — 3 tests: program-address pin (canonical `GdV5rb…`), case-PDA determinism/seed-sensitivity, vault-ATA adapter ≡ `findAssociatedTokenAddress`.
- `src/generated/` regenerated via `make codegen` after the synod program landed (full client: instructions/accounts/pdas/types; canonical `declare_id`).
- Verified: `pnpm -r --filter "./packages/*" lint|build|test` green (sdk 97, synod 3, canon 2 tests pass, 0 fail).
