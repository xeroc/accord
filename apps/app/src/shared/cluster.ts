import { createSolanaRpc } from "@solana/kit";

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
