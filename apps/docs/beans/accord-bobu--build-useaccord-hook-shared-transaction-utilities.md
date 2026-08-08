---
# accord-bobu
title: Build useAccord hook + shared transaction + utilities
status: completed
type: task
created_at: 2026-08-07T23:08:58Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-cb9q
---

Create shared/: (1) rpc.ts — useAccord() hook: combines useKitTransactionSigner() + useCluster() → useMemo(new Accord({endpoint: rpcUrl, signer})) recreated on change. (2) transaction.ts — sendInstruction(rpc, signer, instruction): getLatestBlockhash → pipe createTransactionMessage → setTransactionMessageFeePayerSigner → setTransactionMessageLifetimeUsingBlockhash → appendTransactionMessageInstruction → signTransactionMessageWithSigners → sendAndConfirmTransactionFactory. (3) tokens.ts — ATA derivation via @solana-program/token getAssociatedTokenAddress. (4) format.ts — shortenAddress, formatBigInt, timeRemaining. (5) cluster.ts — cluster list + env var reading.

## Summary of Changes

Created `apps/app/src/shared/` — five modules + barrel export implementing the
dApp's shared data layer. All verified against real Kit 7.0.0 /
@solana/connector 0.2.6 / @useaccord/sdk APIs (types resolved from installed
node_modules, not guessed).

- `shared/cluster.ts` — `ClusterConfig` type + `CLUSTERS` list (devnet default,
  mainnet, localnet), reading `VITE_DEVNET_RPC` / `VITE_MAINNET_RPC` via Vite's
  `import.meta.env`. Auto-derives ws/wss URLs. Feeds y5av's
  `getDefaultConfig({ clusters })`.
- `shared/format.ts` — `shortenAddress`, `formatBigInt` (native BigInt, no BN
  dep), `timeRemaining`. Pure, no Solana types.
- `shared/transaction.ts` — `sendInstruction(rpc, rpcSubscriptions, signer,
instruction)`: getLatestBlockhash → pipe (createTransactionMessage,
  setTransactionMessageFeePayerSigner, setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction) → signTransactionMessageWithSigners →
  assertIsTransactionWithBlockhashLifetime → sendAndConfirmTransactionFactory →
  getSignatureFromTransaction. Returns the base58 signature.
- `shared/tokens.ts` — `getAtaAddress(owner, mint, tokenProgram?)` using
  `findAssociatedTokenPda` from `@solana-program/token` (the real Kit-native
  function; the bean's `getAssociatedTokenAddress` name doesn't exist in the
  package). Exports TOKEN_PROGRAM_ADDRESS + TOKEN_2022_PROGRAM_ADDRESS.
- `shared/rpc.ts` — `useAccord()` hook: `useKitTransactionSigner()` +
  `useCluster()` from `@solana/connector` → `useMemo` → `AccordEnv | null`.
  Reuses the facade's `.rpc` (type-aligned `Rpc<SolanaRpcApi>`) + creates
  `rpcSubscriptions` from the cluster's `urlWs`. Exposes `{ accord, rpc,
rpcSubscriptions, signer, client }`.
- `shared/index.ts` — barrel re-export.

Deps added to `apps/app`: `@useaccord/sdk` (workspace:*), `@solana/kit` ^7.0.0,
`@solana/connector` ^0.2.6, `@solana-program/token` ^0.15.0.

API deviations from the bean body (faithful to the real APIs):

- `tokens.ts`: `findAssociatedTokenPda` (not `getAssociatedTokenAddress` — the
  latter doesn't exist in `@solana-program/token` 0.15.0).
- `transaction.ts`/`rpc.ts`: `sendInstruction` takes `rpcSubscriptions` as an
  explicit 2nd param (the real `sendAndConfirmTransactionFactory` requires it);
  the bean's `(rpc, signer, instruction)` signature omitted it. `useAccord`
  provides both from the cluster.
- `transaction.ts`: `Instruction` type (not `IInstruction` — Kit 7.0.0 export
  name), and `assertIsTransactionWithBlockhashLifetime` to narrow the signed
  transaction for the confirm factory.

Verified: `pnpm --filter @useaccord/app run lint` (tsc --noEmit) passes;
`pnpm --filter @useaccord/app run build` produces static dist/.
