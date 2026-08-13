/**
 * cluster.ts — cluster config for ConnectorKit's getDefaultConfig.
 *
 * providers.tsx builds its cluster list inline via @solana/connector factory
 * functions; CLUSTERS/ClusterConfig are exported for barrel re-export and
 * future consumers. Active-cluster state lives in ConnectorKit (useCluster).
 *
 * Mirrors apps/app's cluster.ts (decision #2).
 */

export interface ClusterConfig {
  id: "devnet" | "mainnet-beta" | "localnet";
  label: string;
  /** HTTP/HTTPS JSON-RPC endpoint. */
  url: string;
  /** WebSocket endpoint for subscriptions (optional; derived if absent). */
  urlWs?: string;
}

const DEVNET_RPC =
  import.meta.env.VITE_DEVNET_RPC || "https://api.devnet.solana.com";
const MAINNET_RPC =
  import.meta.env.VITE_MAINNET_RPC || "https://api.mainnet-beta.solana.com";

/** Derive a ws/wss URL from an http/https endpoint (best-effort). */
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/** The cluster list, wired from VITE_ env vars. Devnet is the MVP default. */
export const CLUSTERS: ClusterConfig[] = [
  {
    id: "devnet",
    label: "Devnet",
    url: DEVNET_RPC,
    urlWs: toWsUrl(DEVNET_RPC),
  },
  {
    id: "mainnet-beta",
    label: "Mainnet",
    url: MAINNET_RPC,
    urlWs: toWsUrl(MAINNET_RPC),
  },
  {
    id: "localnet",
    label: "Localnet",
    url: "http://localhost:8899",
    urlWs: "ws://localhost:8900",
  },
];

/** The default cluster id (devnet for the MVP). */
export const DEFAULT_CLUSTER_ID = "devnet" as const;
