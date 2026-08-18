---
# accord-utod
title: useSynod hook + shared modules (rpc/transaction/wallet/tokens)
status: completed
type: task
created_at: 2026-08-18T19:13:34Z
updated_at: 2026-08-18T19:13:34Z
parent: accord-5fe9
---

Port canon shared/: rpc.ts, transaction.ts, wallet.ts, tokens.ts (ATA derivation), fetch.ts, format.ts, cluster.ts + useSynod hook (programs + sendIx). Consumers: every feature page.

## Summary of Changes

- `shared/rpc.ts` — `useSynod()` (canon useCanon shape): Synod facade + rpc + subscriptions + signer + raw client, plus a bound `sendIx(instruction)` for write paths; `useClusterRpc()` unchanged for signer-less reads.
- Ports completed canon-shaped: `shared/cluster.ts` (CLUSTERS config), `shared/tokens.ts` (ATA derivation via `@solana-program/token`, `getAtaAddress`/`ataAddress`), `shared/index.ts` barrel; `format.ts` extended with `shortAddress`, `formatHash`, `formatWindow`, `timeRemaining`, `timeAgo` (+ tests — the join/evidence views consume these).
- rpc/transaction/wallet/errors/fetch landed incrementally with earlier feature beans (canon-verbatim); consumers migrated: NewCasePage + CaseDetailPage write paths now go through `useSynod().sendIx` — no page calls `sendInstruction` directly.

Verify: app lint ✅ build ✅ tests 53/53 ✅; browser smoke post-migration — home, /cases/new, /cases/:addr all render, zero page errors; workspace CI trio exit 0.
