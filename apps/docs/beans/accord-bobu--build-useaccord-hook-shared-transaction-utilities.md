---
# accord-bobu
title: Build useAccord hook + shared transaction + utilities
status: todo
type: task
created_at: 2026-08-07T23:08:58Z
updated_at: 2026-08-07T23:08:58Z
parent: accord-cb9q
---

Create shared/: (1) rpc.ts — useAccord() hook: combines useKitTransactionSigner() + useCluster() → useMemo(new Accord({endpoint: rpcUrl, signer})) recreated on change. (2) transaction.ts — sendInstruction(rpc, signer, instruction): getLatestBlockhash → pipe createTransactionMessage → setTransactionMessageFeePayerSigner → setTransactionMessageLifetimeUsingBlockhash → appendTransactionMessageInstruction → signTransactionMessageWithSigners → sendAndConfirmTransactionFactory. (3) tokens.ts — ATA derivation via @solana-program/token getAssociatedTokenAddress. (4) format.ts — shortenAddress, formatBigInt, timeRemaining. (5) cluster.ts — cluster list + env var reading.
