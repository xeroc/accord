/**
 * cluster.ts — Solana cluster config + RPC helpers.
 *
 * Two consumers coexist after the scaffold-infrastructure merge:
 *  - Dispute feature hooks import { createRpc, getCluster } for react-query
 *    fetchers (localStorage-backed cluster selection).
 *  - ConnectorKit's getDefaultConfig (providers.tsx) takes @solana/connector
 *    factory functions directly; CLUSTERS/ClusterConfig are exported for
 *    barrel re-export (shared/index.ts) and future consumers.
 */

import { createSolanaRpc } from "@solana/kit";

// --- Function-based cluster for react-query fetchers ---

export type Cluster = "devnet" | "mainnet-beta" | "localnet";

const STORAGE_KEY = "accord-cluster";

const RPC_URLS: Record<Cluster, string> = {
  devnet: import.meta.env.VITE_DEVNET_RPC || "https://api.devnet.solana.com",
  "mainnet-beta":
    import.meta.env.VITE_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
  localnet: "http://localhost:8899",
};

export function getCluster(): Cluster {
  return (localStorage.getItem(STORAGE_KEY) as Cluster) || "devnet";
}

export function setCluster(c: Cluster): void {
  localStorage.setItem(STORAGE_KEY, c);
}

export function getRpcUrl(cluster: Cluster = getCluster()): string {
  return RPC_URLS[cluster];
}

export function createRpc(cluster: Cluster = getCluster()) {
  return createSolanaRpc(getRpcUrl(cluster));
}

// --- Cluster list for ConnectorKit + barrel re-export ---

export interface ClusterConfig {
  id: "devnet" | "mainnet-beta" | "localnet";
  label: string;
  /** HTTP/HTTPS JSON-RPC endpoint. */
  url: string;
  /** WebSocket endpoint for subscriptions (optional; derived if absent). */
  urlWs?: string;
}

/** Derive a ws/wss URL from an http/https endpoint (best-effort). */
function toWsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws");
}

/** The cluster list, wired from VITE_ env vars. Devnet is the MVP default. */
export const CLUSTERS: ClusterConfig[] = [
  {
    id: "devnet",
    label: "Devnet",
    url: RPC_URLS.devnet,
    urlWs: toWsUrl(RPC_URLS.devnet),
  },
  {
    id: "mainnet-beta",
    label: "Mainnet",
    url: RPC_URLS["mainnet-beta"],
    urlWs: toWsUrl(RPC_URLS["mainnet-beta"]),
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
