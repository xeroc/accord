/**
 * rpc.ts — RPC + signer access for both write and read-only views.
 *
 * Two consumers coexist after the subaccord + dispute merge:
 *  - `useAccord()` — composes the SDK Accord facade from the ConnectorKit
 *    signer + active cluster. Used by write paths (dispute feature).
 *  - `getRpc()` / `getEndpoint()` / `getRpcSubscriptions()` — bare read-only
 *    RPC for list/detail views that don't need a signer (subaccord feature).
 */

import { useMemo } from "react";
import { useCluster, useKitTransactionSigner } from "@solana/connector";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";
import { Accord, type AccordClient } from "@useaccord/sdk";

export interface AccordEnv {
  /** The Accord SDK facade — typed instruction builders + account fetchers. */
  accord: Accord;
  /** Kit RPC bound to the active cluster (same instance the facade uses). */
  rpc: Accord["rpc"];
  /** Kit RPC subscriptions bound to the active cluster's WS endpoint. */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The connected wallet's Kit TransactionSigner (fee payer + instruction signer). */
  signer: TransactionSigner;
  /** The raw generated Codama client (for direct account fetches / PDAs). */
  client: AccordClient;
}

/**
 * Build an {@link AccordEnv} from the active ConnectorKit signer + cluster.
 *
 * Returns `null` until a wallet is connected (signer is null) or no cluster
 * is active. Feature hooks/components should early-return when this is null.
 */
export function useAccord(): AccordEnv | null {
  const { signer } = useKitTransactionSigner();
  const { cluster } = useCluster();

  return useMemo<AccordEnv | null>(() => {
    if (!signer || !cluster) return null;

    const accord = new Accord({ endpoint: cluster.url, signer });
    const rpcSubscriptions = createSolanaRpcSubscriptions(
      cluster.urlWs ?? cluster.url.replace(/^http/, "ws"),
    );

    return {
      accord,
      rpc: accord.rpc,
      rpcSubscriptions,
      signer,
      client: accord.client,
    };
  }, [signer, cluster]);
}

// --- Standalone read-only RPC (subaccord list/detail views) ---------------

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

/** Bare read-only RPC for the active cluster. Default devnet. */
export function getRpc(cluster: Cluster = "devnet"): Rpc<SolanaRpcApi> {
  return createSolanaRpc(RPC_URLS[cluster]);
}

/** WebSocket subscriptions endpoint — `sendAndConfirm` needs both. */
export function getRpcSubscriptions(
  cluster: Cluster = "devnet",
): RpcSubscriptions<SolanaRpcSubscriptionsApi> {
  return createSolanaRpcSubscriptions(WS_URLS[cluster]);
}
