/**
 * Cluster + RPC source for read-only views (decision #6).
 *
 * Devnet default; URLs via `VITE_DEVNET_RPC` / `VITE_MAINNET_RPC`. The write
 * path (wallet, signing) lands with ConnectorKit; reads only need an `Rpc`.
 */
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

export type Cluster = "devnet" | "mainnet" | "localnet";

const RPC_URLS: Record<Cluster, string> = {
  devnet: import.meta.env.VITE_DEVNET_RPC ?? "https://api.devnet.solana.com",
  mainnet:
    import.meta.env.VITE_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

const WS_URLS: Record<Cluster, string> = {
  devnet: "wss://api.devnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

/** Bare endpoint URL for the active cluster — the `Accord` facade takes a
 * string endpoint (it builds its own rpc internally), so write views need the
 * raw URL rather than the constructed `Rpc`. */
export function getEndpoint(cluster: Cluster = "devnet"): string {
  return RPC_URLS[cluster];
}

/**
 * Bare read-only RPC for the active cluster. Default devnet. The return is the
 * full Kit RPC (narrows at every GPA/fetch call site); default cluster kept in
 * a closure so all read hooks share one endpoint.
 */
export function getRpc(cluster: Cluster = "devnet"): Rpc<SolanaRpcApi> {
  return createSolanaRpc(RPC_URLS[cluster]);
}

/** WebSocket subscriptions endpoint for the active cluster — `sendAndConfirm`
 * (shared/transaction.ts) needs both an rpc and an rpcSubscriptions handle. */
export function getRpcSubscriptions(
  cluster: Cluster = "devnet",
): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  return createSolanaRpcSubscriptions(WS_URLS[cluster]);
}
