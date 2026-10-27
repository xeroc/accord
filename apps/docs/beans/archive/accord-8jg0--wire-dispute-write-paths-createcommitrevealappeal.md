---
# accord-8jg0
title: Wire dispute write paths (create/commit/reveal/appeal) to SDK facade
status: completed
type: task
priority: normal
created_at: 2026-08-08T22:51:25Z
updated_at: 2026-08-08T23:05:56Z
---

Replace the three accord-y5av ponytail stubs in apps/app/src/features/dispute/ with real SDK facade calls, following the SubaccordCreatePage pattern (useAccord + sendInstruction + ATA derivation via shared/tokens).

## Summary of Changes

Replaced the four accord-y5av ponytail stubs (ConnectorKit is now wired via
`useAccord()`/`useSigner()`) with real SDK-facade → `sendInstruction` calls,
following the SubaccordCreatePage pattern.

- `packages/sdk/src/methods/voting.ts` — removed the stale `reveal()` guard that
  demanded `stakingToken`/`jurorTokenAccount`/`vault`. Reality: on-chain
  `Reveal` (lib.rs:3100) takes only juror/subaccord/dispute/round; ADR-0020
  moved reveal's fee credit to `finalize_round`. The adapter already ignored
  these fields; the guard was the last lie blocking callers. Optional fields
  marked `@deprecated` + doc-comment reconciled. e2e voting + appeal specs stay
  green (they still pass the fields, now ignored as before).
- `apps/app/src/features/dispute/CreateDispute.tsx` — wired `handleSubmit` to
  `accord.methods.createDispute`. Derives `feeVault` (ATA of subaccord PDA +
  feeToken), `filerTokenAccount`, `pauseState` PDA; navigates to
  `/disputes/:address` on success. Added `hexToBytes32` helper.
- `apps/app/src/features/dispute/Voting.tsx` — replaced the hand-rolled
  localStorage wallet field with `useAccord()` (the real ConnectorKit signer).
  Wired `handleCommit` (`methods.commit` + salt persisted for reveal) and
  `handleReveal` (`methods.reveal`). Salt persistence across sessions kept
  (legit client state). Connect-wallet gate when no signer.
- `apps/app/src/features/dispute/DisputeDetail.tsx` — wired the appeal button
  to `accord.methods.appeal`. Derives `appealBond` PDA (new round),
  `pauseState`, `feeVault`, `appellantTokenAccount`; loads subaccord for
  `feeToken`. Button gates on env/subaccord/sending.

Verification: `pnpm --filter @useaccord/app run lint` clean;
`pnpm --filter @useaccord/sdk run lint` clean; `cd tests && pnpm test -- voting`
green (2/2); `cd tests && pnpm test -- appeal` green (4/4) — both against a
running Surfpool instance.
