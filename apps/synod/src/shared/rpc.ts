/**
 * rpc.ts — RPC + signer access for the Synod dApp.
 *
 * Two layers (mirrors apps/canon/src/shared/rpc.ts):
 *  - `useSynod()` — composes the Synod SDK facade from the ConnectorKit
 *    signer + active cluster, with a bound `sendIx` for write paths
 *    (open case, join, file, claim, refund).
 *  - `useClusterRpc()` / `ClusterRpc` — bare read-only RPC bound to the
 *    active ConnectorKit cluster. Used by views that don't need a signer.
 */

import { useMemo } from "react";
import { useCluster, useKitTransactionSigner } from "@solana/connector";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Instruction,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";
import { Synod, type SynodClient } from "@useaccord/synod";

import { sendInstruction } from "./transaction";

// --- Write-path facade (signer bound) ---------------------------------------

export interface SynodEnv {
  /** The Synod SDK facade — typed instruction builders + account fetchers. */
  synod: Synod;
  /** Kit RPC bound to the active cluster (same instance the facade uses). */
  rpc: Synod["rpc"];
  /** Kit RPC subscriptions bound to the active cluster's WS endpoint. */
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The connected wallet's Kit TransactionSigner (fee payer + signer). */
  signer: TransactionSigner;
  /** The raw generated Codama client (for direct account fetches / PDAs). */
  client: SynodClient;
  /** Send one instruction signed by the connected wallet; returns the sig. */
  sendIx: (instruction: Instruction) => Promise<string>;
}

/**
 * Build a {@link SynodEnv} from the active ConnectorKit signer + cluster.
 *
 * Returns `null` until a wallet is connected (signer is null) or no cluster
 * is active. Write views should early-return when this is null.
 */
export function useSynod(): SynodEnv | null {
  const { signer } = useKitTransactionSigner();
  const { cluster } = useCluster();

  return useMemo<SynodEnv | null>(() => {
    if (!signer || !cluster) return null;

    // Cast to string: cluster.url is a MainnetUrl|DevnetUrl|… union that
    // selects a cluster-specific Rpc overload; we want the generic one.
    const url = cluster.url as string;
    const wsUrl = (cluster.urlWs as string) ?? url.replace(/^http/, "ws");
    const synod = new Synod({ endpoint: url, signer });
    const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);

    return {
      synod,
      rpc: synod.rpc,
      rpcSubscriptions,
      signer,
      client: synod.client,
      sendIx: (instruction) =>
        sendInstruction(synod.rpc, rpcSubscriptions, signer, instruction),
    };
  }, [signer, cluster]);
}

// --- Standalone read-only RPC (watcher views) -------------------------------

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
 *
 * Use this in read-only views (home, case detail) that don't need a signer.
 * Write views that need a signer use `useSynod()` instead.
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
