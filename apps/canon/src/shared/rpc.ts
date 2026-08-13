/**
 * Signer + RPC seams for the Canon dApp.
 * Mirrors apps/app's shared/wallet.ts + shared/rpc.ts contract.
 */
import { useMemo } from "react";
import { useCluster, useKitTransactionSigner } from "@solana/connector";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  type Address,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";

export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

export interface SignerState {
  signer: TransactionSigner | null;
  ready: boolean;
}

export function useSigner(): SignerState {
  return useKitTransactionSigner();
}

export interface ClusterRpc {
  endpoint: string;
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

/** Read-only RPC bound to the active ConnectorKit cluster. */
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
