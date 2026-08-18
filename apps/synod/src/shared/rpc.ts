/**
 * rpc.ts — RPC access for the Synod dApp.
 *
 * `useClusterRpc()` / `ClusterRpc` — read-only RPC bound to the active
 * ConnectorKit cluster (subaccord browser, inline paste validation, sending).
 * The signer-bound facade hook (`useSynod`) lands with accord-utod.
 *
 * Mirrors apps/canon/src/shared/rpc.ts.
 */

import { useMemo } from "react";
import { useCluster } from "@solana/connector";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

export interface ClusterRpc {
  /** Bare endpoint URL. */
  endpoint: string;
  /** Bare read-only RPC bound to the active cluster. */
  rpc: Rpc<SolanaRpcApi>;
  /** WebSocket subscriptions — `sendAndConfirm` needs both. */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

/**
 * Read-only RPC bound to the **active ConnectorKit cluster** — the same one
 * the navbar selector drives. Returns `null` only if no cluster is active.
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
