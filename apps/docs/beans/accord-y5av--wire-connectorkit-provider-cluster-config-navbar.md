---
# accord-y5av
title: Wire ConnectorKit provider + cluster config + navbar
status: completed
type: task
created_at: 2026-08-07T23:08:58Z
updated_at: 2026-08-08T00:00:00Z
parent: accord-cb9q
---

Install @solana/connector. Create Providers component with AppProvider + getDefaultConfig({ appName: 'Accord', clusters: [devnet (VITE_DEVNET_RPC), mainnet (VITE_MAINNET_RPC), localnet (localhost:8899)], network: 'devnet' }). Build top navbar: wordmark + convergence glyph left, cluster selector (useCluster) + wallet connect button (useConnector) right. Mono status bar style per DESIGN.md §08.

## Summary of Changes

Wired ConnectorKit's `AppProvider` + `getDefaultConfig` into the app, and built
the top navbar with cluster selector + wallet connect/disconnect button.

- `src/providers.tsx` — `<Providers>` wraps `<AppProvider connectorConfig={...}>`.
  Config uses `getDefaultConfig({ appName: "Accord", network: "devnet", clusters:
[createSolanaDevnet, createSolanaMainnet, createSolanaLocalnet] })` with RPC
  URLs from `VITE_DEVNET_RPC` / `VITE_MAINNET_RPC` env vars.
- `src/components/navbar.tsx` — `<Navbar>`: ACCORD wordmark + ◇ glyph left (Link
  to `/`); right side has shadcn `<Select>` bound to `useCluster().cluster` +
  `setCluster`, and a wallet connect/disconnect button using `useAccount()`,
  `useConnectWallet()`, `useDisconnectWallet()`, `useWalletConnectors()`.
  Connected state shows `shortenAddress(address)` + Disconnect; disconnected
  shows "Connect wallet." that connects to the first ready connector.
- `src/main.tsx` — wraps the app in `<Providers>` (outside `<HashRouter>`).
- `src/App.tsx` — mounts `<Navbar />` at the top.

`@solana/connector` was already installed (accord-bobu added it). The navbar is
IBM Plex Mono, ink/raised surfaces, hairline border — per BRAND.md.

Verified: `pnpm --filter @useaccord/app run lint` (tsc --noEmit) passes;
`pnpm --filter @useaccord/app run build` produces static dist.
