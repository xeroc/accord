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

export interface ClusterRpc {
  /** Bare endpoint URL — the `Accord` facade takes a string endpoint. */
  endpoint: string;
  /** Bare read-only RPC bound to the active cluster. */
  rpc: Rpc<SolanaRpcApi>;
  /** WebSocket subscriptions — `sendAndConfirm` needs both. */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

/**
 * Read-only RPC bound to the **active ConnectorKit cluster** — the same one
 * the navbar selector drives. Returns `null` only if no cluster is active
 * (should not happen with the default config, but callers should gate).
 *
 * Use this in read-only views (list/detail) that don't need a signer. Write
 * views that need a signer use `useAccord()` instead.
 */
export function useClusterRpc(): ClusterRpc | null {
  const { cluster } = useCluster();

  return useMemo<ClusterRpc | null>(() => {
    if (!cluster) return null;
    // Cast to string: cluster.url is a MainnetUrl|DevnetUrl|… union that
    // selects a cluster-specific Rpc overload; we want the generic one.
    const url = cluster.url as string;
    const wsUrl = (cluster.urlWs as string) ?? url.replace(/^http/, "ws");
    return {
      endpoint: url,
      rpc: createSolanaRpc(url),
      rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
    };
  }, [cluster]);
}
