/**
 * rpc.ts — RPC + signer access for both write and read-only views.
 *
 *  - `useCanon()` — composes the @useaccord/canon SDK facade from the
 *    ConnectorKit signer + active cluster. Used by write paths (withdrawal).
 *  - `useClusterRpc()` / `getRpc()` — bare read-only RPC for detail views
 *    that don't need a signer (item / list reads).
 *
 * Mirrors apps/app/src/shared/rpc.ts; the facade is `Canon` instead of `Accord`.
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
import { Canon, type CanonClient } from "@useaccord/canon";

export interface CanonEnv {
  /** The Canon SDK facade — typed instruction builders + account fetchers. */
  canon: Canon;
  /** Kit RPC bound to the active cluster (same instance the facade uses). */
  rpc: Canon["rpc"];
  /** Kit RPC subscriptions bound to the active cluster's WS endpoint. */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The connected wallet's Kit TransactionSigner (fee payer + instruction signer). */
  signer: TransactionSigner;
  /** The raw generated Codama client (for direct account fetches / PDAs). */
  client: CanonClient;
}

/**
 * Build a {@link CanonEnv} from the active ConnectorKit signer + cluster.
 *
 * Returns `null` until a wallet is connected (signer is null) or no cluster
 * is active. Feature hooks/components should early-return when this is null.
 */
export function useCanon(): CanonEnv | null {
  const { signer } = useKitTransactionSigner();
  const { cluster } = useCluster();

  return useMemo<CanonEnv | null>(() => {
    if (!signer || !cluster) return null;

    const canon = new Canon({ endpoint: cluster.url, signer });
    const rpcSubscriptions = createSolanaRpcSubscriptions(
      cluster.urlWs ?? cluster.url.replace(/^http/, "ws"),
    );

    return {
      canon,
      rpc: canon.rpc,
      rpcSubscriptions,
      signer,
      client: canon.client,
    };
  }, [signer, cluster]);
}

// --- Standalone read-only RPC (item / list detail views) -------------------

export interface ClusterRpc {
  /** Bare endpoint URL — the `Canon` facade takes a string endpoint. */
  endpoint: string;
  /** Bare read-only RPC bound to the active cluster. */
  rpc: Rpc<SolanaRpcApi>;
  /** WebSocket subscriptions — `sendAndConfirm` needs both. */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

/**
 * Read-only RPC bound to the active ConnectorKit cluster. Returns `null` only
 * if no cluster is active. Use in read-only views (item/list detail) that
 * don't need a signer; write views use `useCanon()`.
 */
export function useClusterRpc(): ClusterRpc | null {
  const { cluster } = useCluster();

  return useMemo<ClusterRpc | null>(() => {
    if (!cluster) return null;
    const url = cluster.url as string;
    const wsUrl = (cluster.urlWs as string) ?? url.replace(/^http/, "ws");
    return {
      endpoint: url,
      rpc: createSolanaRpc(url),
      rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
    };
  }, [cluster]);
}
