/**
 * Cluster + RPC source for read-only views (decision #6).
 *
 * Devnet default; URLs via `VITE_DEVNET_RPC` / `VITE_MAINNET_RPC`. The write
 * path (wallet, signing) lands with ConnectorKit; reads only need an `Rpc`.
 */
import { createSolanaRpc } from "@solana/kit";

export type Cluster = "devnet" | "mainnet" | "localnet";

const RPC_URLS: Record<Cluster, string> = {
  devnet: import.meta.env.VITE_DEVNET_RPC ?? "https://api.devnet.solana.com",
  mainnet:
    import.meta.env.VITE_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

/**
 * Bare read-only RPC for the active cluster. Default devnet. The return is the
 * full Kit RPC (narrows at every GPA/fetch call site); default cluster kept in
 * a closure so all read hooks share one endpoint.
 */
export function getRpc(cluster: Cluster = "devnet") {
  return createSolanaRpc(RPC_URLS[cluster]);
}
