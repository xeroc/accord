/**
 * rpc.ts — RPC + signer access for the Canon dApp.
 *
 * Three layers:
 *  - `useCanon()` — composes the Canon SDK facade from the ConnectorKit
 *    signer + active cluster. Used by write paths (submit/challenge/withdraw).
 *  - `useClusterRpc()` / `ClusterRpc` — bare read-only RPC bound to the active
 *    ConnectorKit cluster. Used by list/detail views that don't need a signer.
 *  - Typed bulk reads — `findAllCanonLists` / `findAllCanonItemsByList` /
 *    `fetchCanonListRaw`: `getProgramAccounts` + single-account decode over a
 *    raw RPC via the SDK decoders (no `Canon` facade/signer needed). Mirrors
 *    the Accord SDK's `findAllSubaccords` (ADR-0010).
 *
 * Mirrors apps/app/src/shared/rpc.ts.
 */

import { useMemo } from "react";
import { useCluster, useKitTransactionSigner } from "@solana/connector";
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  getBase58Decoder,
  getBase64Encoder,
  type Account,
  type Address,
  type Base58EncodedBytes,
  type GetProgramAccountsApi,
  type GetProgramAccountsMemcmpFilter,
  type ReadonlyUint8Array,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";
import {
  CANON_LIST_DISCRIMINATOR,
  CANON_ITEM_DISCRIMINATOR,
  CANON_PROGRAM_ID,
  Canon,
  getCanonListDecoder,
  getCanonItemDecoder,
  type CanonClient,
  type CanonList,
  type CanonItem,
} from "@useaccord/canon";

// --- Signer seam (ConnectorKit) --------------------------------------------

export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

export interface SignerState {
  signer: TransactionSigner | null;
  ready: boolean;
}

/**
 * Resolve the connected wallet's Kit TransactionSigner via ConnectorKit.
 * Returns `{ signer: null, ready: false }` until a wallet is connected.
 */
export function useSigner(): SignerState {
  return useKitTransactionSigner();
}

// --- Write-path facade (signer bound) ---------------------------------------

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

// --- Standalone read-only RPC (watcher list/detail views) -------------------

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
 * Use this in read-only views (list/detail) that don't need a signer. Write
 * views that need a signer use `useCanon()` instead.
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

// --- Typed getProgramAccounts: all CanonLists -------------------------------

const base58 = getBase58Decoder();

/** Anchor account discriminator sits at offset 0 (8 bytes). */
function discriminatorFilter(
  discriminator: ReadonlyUint8Array,
): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      offset: 0n,
      bytes: base58.decode(discriminator) as Base58EncodedBytes,
      encoding: "base58",
    },
  };
}

/**
 * Fetch every `CanonList` account on the Canon program (discriminator-only
 * filter). Returns fully decoded `Account<CanonList>[]` — no raw bytes leak to
 * the caller.
 */
export async function findAllCanonLists(
  rpc: Rpc<GetProgramAccountsApi>,
): Promise<Account<CanonList>[]> {
  const results = await rpc
    .getProgramAccounts(CANON_PROGRAM_ID, {
      encoding: "base64",
      filters: [discriminatorFilter(CANON_LIST_DISCRIMINATOR)],
    })
    .send();
  const base64 = getBase64Encoder();
  return results.map((info) => {
    const [data] = info.account.data;
    return {
      ...info.account,
      address: info.pubkey,
      programAddress: CANON_PROGRAM_ID,
      data: getCanonListDecoder().decode(base64.encode(data)),
    } as Account<CanonList>;
  });
}

// --- Typed getProgramAccounts: CanonItems by list ---------------------------

/** CanonItem `list` field offset: 8-byte disc + 32-byte `account` = byte 40. */
const CANON_ITEM_LIST_OFFSET = 40n;

/** A 32-byte `Address` field at a fixed byte offset (base58-encoded). */
function addressFilter(
  offset: bigint,
  address: Address,
): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      offset,
      bytes: address as Base58EncodedBytes,
      encoding: "base58",
    },
  };
}

/** Fetch every `CanonItem` under a given `CanonList` (memcmp on `list` at
 * byte 40). Returns fully decoded `Account<CanonItem>[]`. */
export async function findAllCanonItemsByList(
  rpc: Rpc<GetProgramAccountsApi>,
  list: Address,
): Promise<Account<CanonItem>[]> {
  const results = await rpc
    .getProgramAccounts(CANON_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        discriminatorFilter(CANON_ITEM_DISCRIMINATOR),
        addressFilter(CANON_ITEM_LIST_OFFSET, list),
      ],
    })
    .send();
  const base64 = getBase64Encoder();
  return results.map((info) => {
    const [data] = info.account.data;
    return {
      ...info.account,
      address: info.pubkey,
      programAddress: CANON_PROGRAM_ID,
      data: getCanonItemDecoder().decode(base64.encode(data)),
    } as Account<CanonItem>;
  });
}

// --- Single-account read (raw RPC + decoder) --------------------------------

/**
 * Decoded CanonList at `address`, or `null` if the account doesn't exist.
 * Uses the SDK decoder directly — no `Canon` facade/signer needed.
 */
export async function fetchCanonListRaw(
  rpc: Rpc<SolanaRpcApi>,
  address: Address,
): Promise<Account<CanonList> | null> {
  const res = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
  if (!res.value) return null;
  const [data] = res.value.data;
  return {
    ...res.value,
    address,
    programAddress: CANON_PROGRAM_ID,
    data: getCanonListDecoder().decode(getBase64Encoder().encode(data)),
  } as Account<CanonList>;
}
