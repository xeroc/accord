/**
 * Typed `getProgramAccounts` query wrappers for Canon accounts.
 *
 * Mirrors `@useaccord/sdk`'s `queries.ts`: discriminator-only GPA filters +
 * decode, so callers never touch raw bytes or memcmp offsets. Returns typed
 * `Account<T>[]` with the account address preserved.
 *
 * @see ADR-0010
 */

import {
  type Account,
  type Address,
  type Base64EncodedBytes,
  type Commitment,
  type GetProgramAccountsApi,
  parseBase64RpcAccount,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";

import {
  CANON_LIST_DISCRIMINATOR,
  decodeCanonList,
  type CanonList,
} from "./generated/accounts/canonList.js";
import {
  CANON_ITEM_DISCRIMINATOR,
  decodeCanonItem,
  type CanonItem,
} from "./generated/accounts/canonItem.js";
import { CANON_PROGRAM_ID } from "./pda.js";

export type QueryConfig = {
  commitment?: Commitment;
  abortSignal?: AbortSignal;
};

function discriminatorToBase64(d: ReadonlyUint8Array): Base64EncodedBytes {
  // ponytail: btoa for 8-byte discriminator — no perf concern
  return btoa(String.fromCharCode(...d)) as Base64EncodedBytes;
}

/**
 * Fetch every CanonList account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllCanonLists(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
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
    decodeCanonList(parseBase64RpcAccount(pubkey as Address, account)),
  );
}

/**
 * Fetch every CanonItem account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllCanonItems(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
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
    decodeCanonItem(parseBase64RpcAccount(pubkey as Address, account)),
  );
}
