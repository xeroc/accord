/**
 * fetch.ts — typed account reads over a raw Kit RPC (read-only — no signer).
 *
 * Two layers (mirrors apps/app/src/shared/fetch.ts + packages/sdk/src/queries.ts):
 *  - Single-account reads: `fetchCanonList` / `fetchCanonItem` — decode a raw
 *    `getAccountInfo` base64 response via the SDK's exported codec.
 *  - Scan helpers: `findAllCanonLists`, `findAllCanonItems`,
 *    `findCanonItemsByList` — `getProgramAccounts` with discriminator + memcmp
 *    filters, decoded via `parseBase64RpcAccount` + `decodeAccount`.
 *
 * The SDK's facade-bound fetchers (`fetchCanonList(canon, addr)`) need a `Canon`
 * instance (carries a signer). Read-only views decode via the exported codec
 * directly — same pattern `apps/app` uses for `fetchSubaccord`.
 */

import {
  decodeAccount,
  getBase64Encoder,
  parseBase64RpcAccount,
  type Account,
  type Address,
  type Base58EncodedBytes,
  type Base64EncodedBytes,
  type Commitment,
  type GetProgramAccountsApi,
  type ReadonlyUint8Array,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  CANON_ITEM_DISCRIMINATOR,
  CANON_LIST_DISCRIMINATOR,
  CANON_PROGRAM_ID,
  getCanonItemDecoder,
  getCanonListDecoder,
  type CanonItem,
  type CanonList,
} from "@useaccord/canon";

// --- Single-account reads (read-only — no signer needed) -------------------

/**
 * Decode a CanonList by address over a raw RPC.
 * Returns `null` if the account doesn't exist.
 */
export async function fetchCanonList(
  rpc: Rpc<SolanaRpcApi>,
  address: Address,
): Promise<CanonList | null> {
  const res = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
  if (!res.value) return null;
  const [data] = res.value.data;
  return getCanonListDecoder().decode(getBase64Encoder().encode(data));
}

/**
 * Decode a CanonItem by address over a raw RPC.
 * Returns `null` if the account doesn't exist.
 */
export async function fetchCanonItem(
  rpc: Rpc<SolanaRpcApi>,
  address: Address,
): Promise<CanonItem | null> {
  const res = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
  if (!res.value) return null;
  const [data] = res.value.data;
  return getCanonItemDecoder().decode(getBase64Encoder().encode(data));
}

// --- getProgramAccounts scan helpers ---------------------------------------

/**
 * Byte offset of the `list` field inside a CanonItem account.
 *
 * Layout: 8-byte Anchor discriminator + 32-byte `account` Pubkey = byte 40.
 * Confirmed against the generated codec (`canonItem.ts` struct order:
 * discriminator, account, list, …). Used as the `memcmp.offset` for
 * {@link findCanonItemsByList}.
 */
export const CANON_ITEM_LIST_OFFSET = 40n;

export interface ScanConfig {
  commitment?: Commitment;
  abortSignal?: AbortSignal;
}

/**
 * Convert an 8-byte discriminator to a base64 RPC memcmp filter value.
 * (Same helper the Accord SDK uses internally — `btoa` over the raw bytes.)
 */
function discriminatorToBase64(d: ReadonlyUint8Array): Base64EncodedBytes {
  return btoa(String.fromCharCode(...d)) as Base64EncodedBytes;
}

/**
 * Fetch every CanonList account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllCanonLists(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: ScanConfig,
): Promise<Account<CanonList>[]> {
  const results = await rpc
    .getProgramAccounts(CANON_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(CANON_LIST_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodeAccount(
      parseBase64RpcAccount(pubkey as Address, account),
      getCanonListDecoder(),
    ),
  );
}

/**
 * Fetch every CanonItem account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllCanonItems(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: ScanConfig,
): Promise<Account<CanonItem>[]> {
  const results = await rpc
    .getProgramAccounts(CANON_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(CANON_ITEM_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodeAccount(
      parseBase64RpcAccount(pubkey as Address, account),
      getCanonItemDecoder(),
    ),
  );
}

/**
 * Fetch every CanonItem belonging to a specific CanonList, decoded and typed.
 *
 * Uses two memcmp filters:
 *  1. CanonItem discriminator at offset 0 (narrow to CanonItem accounts).
 *  2. The list address at {@link CANON_ITEM_LIST_OFFSET} (byte 40).
 *
 * This is the read path for the list-detail view (`/lists/:address`).
 */
export async function findCanonItemsByList(
  rpc: Rpc<GetProgramAccountsApi>,
  listAddress: Address,
  config?: ScanConfig,
): Promise<Account<CanonItem>[]> {
  const results = await rpc
    .getProgramAccounts(CANON_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(CANON_ITEM_DISCRIMINATOR),
            encoding: "base64",
          },
        },
        {
          memcmp: {
            offset: CANON_ITEM_LIST_OFFSET,
            bytes: listAddress as Base58EncodedBytes,
            encoding: "base58",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodeAccount(
      parseBase64RpcAccount(pubkey as Address, account),
      getCanonItemDecoder(),
    ),
  );
}
