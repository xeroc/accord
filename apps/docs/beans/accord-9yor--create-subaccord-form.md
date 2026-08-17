---
# accord-9yor
title: Create subaccord form
status: completed
type: task
created_at: 2026-08-07T23:09:07Z
updated_at: 2026-08-07T23:09:07Z
parent: accord-pjxh
---

Controlled form at /subaccords/new. Fields: stakingToken (address), minStake (bigint), alphaBps (0-10000), reviewWindow/commitWindow/revealWindow (seconds bigint), maxAppeals (0-3), feePerJuror (bigint), authority (address, default = connected wallet or Pubkey::default for immutable), evidenceOperator (default Pubkey::default), domainRef (32-byte hex), evidenceSpec (default [0;32]), depth (default 20). On submit: derive subaccord PDA, build createSubaccord instruction via accord.methods, sendInstruction, redirect to /subaccords/:address.

## Summary of Changes

- `SubaccordCreatePage` (`apps/app/src/features/subaccord/`) — controlled form
  for every `CreateSubaccordArgs` field (the real SDK type carries more than the
  bean's 13: also feeToken ADR-0020, appealWindow ADR-0022, revealThresholdBps +
  shortfallPolicy + maxDrawAttempts ADR-0021; v1-sole enums `Aggregation.Plurality`
  and `ShortfallPolicy.Redraw` are hardcoded). On submit it parses strings →
  typed args, builds the ix via `accord.methods.createSubaccord(signer.address,
args)`, sends via `sendInstruction`, and redirects to `/subaccords/:address`.
  The creator IS the connected wallet (adapter wires `creator: accord.signer`),
  so the PDA `[subaccord, signer, domainRef]` matches the signing account.
- `shared/transaction.ts` — `sendInstruction(rpc, rpcSubscriptions, signer, ix)`
  per the milestone handoff §4 (blockhash → fee-payer signer → lifetime →
  append → sign → sendAndConfirm). Genuinely shared; accord-bobu may adopt it.
- `shared/wallet.ts` — `useSigner()` seam + `ZERO_ADDRESS`. The seam returns
  `null` today; accord-y5av (ConnectorKit provider + navbar) replaces the body
  with `useKitTransactionSigner()` and every write view lights up at once.
- `shared/rpc.ts` — added `getRpcSubscriptions(cluster)` + `getEndpoint(cluster)`
  (the facade takes a raw endpoint string).
- `App.tsx` — `/subaccords/new` route; `index.css` — form fieldset/input styles.

Signer dependency: the SDK adapter hardcodes `creator: accord.signer`, so the
send path needs a live `TransactionSigner`. ConnectorKit is not yet installed
(that's accord-y5av's scope); until it lands, the form renders a "Connect a
wallet." gate (BRAND.md voice). The submit handler + ix-building + send +
redirect are fully wired and activate the moment a real signer is provided.

Verified: `pnpm --filter @useaccord/app run typecheck` clean;
`pnpm --filter @useaccord/app run build` ✓ (239 kB js / 7.4 kB css).
