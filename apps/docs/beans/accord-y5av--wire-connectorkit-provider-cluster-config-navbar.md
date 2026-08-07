---
# accord-y5av
title: Wire ConnectorKit provider + cluster config + navbar
status: todo
type: task
created_at: 2026-08-07T23:08:58Z
updated_at: 2026-08-07T23:08:58Z
parent: accord-cb9q
---

Install @solana/connector. Create Providers component with AppProvider + getDefaultConfig({ appName: 'Accord', clusters: [devnet (VITE_DEVNET_RPC), mainnet (VITE_MAINNET_RPC), localnet (localhost:8899)], network: 'devnet' }). Build top navbar: wordmark + convergence glyph left, cluster selector (useCluster) + wallet connect button (useConnector) right. Mono status bar style per DESIGN.md §08.
