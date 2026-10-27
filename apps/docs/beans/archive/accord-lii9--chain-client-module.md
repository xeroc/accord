---
# accord-lii9
title: Chain client module
status: completed
type: task
created_at: 2026-10-15T07:32:41Z
updated_at: 2026-10-15T09:20:00Z
parent: accord-sozc
---


## Summary of Changes

- `src/chain/client.ts` — `createChainClient(config, deps?)`: kit `createSolanaRpc` + `createSolanaRpcSubscriptions`, operator `KeyPairSigner` from `JURAT_KEYPAIR_PATH` (`loadOperatorSigner` — file read, JSON parse, 64-uint8 validation, `createKeyPairSignerFromBytes`), `new Accord({ endpoint, signer })` facade, `sendIx` (v0 tx → blockhash lifetime → sign → `sendAndConfirmTransactionFactory` at confirmed; no retry ladder — duty pipeline owns failure policy), `readClock()` (Clock sysvar `getAccountInfo` + byte decode — kit 7 has no typed `getClock`; same layout as `tests/src/setup/cheats.ts`). `deps` param is the test injection seam.
- `src/config.ts` — `wsUrl` (optional `JURAT_WS_URL`, else `deriveWsUrl`: http→ws, port+1) since send-confirmation needs WS; config owns derivation to avoid a chain→config cycle.
- `src/chain/client.test.ts` — 4 tests / 17 total green: keypair roundtrip via kit `writeKeyPair(generateKeyPair(true))` (arbitrary bytes rejected — kit validates seed↔pub), all malformed-keypair paths, mocked-rpc clock poll (base64 sysvar account stub — kit tuple is `[payload, "base64"]`).
- `src/main.ts` — mounts `createChainClient`; boots logging rpc + operator address + dryRun.
- `package.json` — deps `@solana/kit` + `@useaccord/sdk` (workspace).

AC verified: `bun test` 17/17, jurat + workspace `pnpm -r run build`/`lint` exit 0, full-env `bun run src/main.ts` boots (operator addr printed). Surfpool e2e deferred to the duty-pipeline epic per the bean text.
src/chain/client.ts: RpcClient + keypair signer + Accord facade + sendIx with confirm; pubkey from keypair; poll clock read. AC: unit test with mocked rpc; runs against Surfpool in e2e later.
