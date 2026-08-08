/**
 * rpc.ts — useAccord() hook: composes the SDK Accord facade from the
 * ConnectorKit signer + active cluster.
 *
 * Returns null until a wallet is connected. The facade is recreated whenever
 * the signer or cluster changes (via useMemo), so callers always see a
 * consistent client bound to the current network.
 */

import { useMemo } from "react";
import { useCluster, useKitTransactionSigner } from "@solana/connector";
import {
  createSolanaRpcSubscriptions,
  type RpcSubscriptions,
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
