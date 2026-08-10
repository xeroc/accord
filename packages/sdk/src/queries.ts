/**
 * Typed `getProgramAccounts` query wrappers.
 *
 * Each function encapsulates the discriminator + memcmp construction so the
 * caller never touches raw bytes. Returns typed `Account<T>[]` with the
 * account address preserved (needed for deep links, PDA navigation, etc.).
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
  DISPUTE_DISCRIMINATOR,
  decodeDispute,
  type Dispute,
} from "./generated/accounts/dispute.js";
import {
  PENDING_UPDATE_DISCRIMINATOR,
  decodePendingUpdate,
  type PendingUpdate,
} from "./generated/accounts/pendingUpdate.js";
import { ACCORD_PROGRAM_ID } from "./pda.js";

export type QueryConfig = {
  commitment?: Commitment;
  abortSignal?: AbortSignal;
};

function discriminatorToBase64(d: ReadonlyUint8Array): Base64EncodedBytes {
  // ponytail: btoa for 8-byte discriminator — no perf concern
  return btoa(String.fromCharCode(...d)) as Base64EncodedBytes;
}

/**
 * Fetch every Dispute account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllDisputes(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
): Promise<Account<Dispute>[]> {
  const results = await rpc
    .getProgramAccounts(ACCORD_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(DISPUTE_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodeDispute(parseBase64RpcAccount(pubkey as Address, account)),
  );
}

/**
 * Fetch every PendingUpdate account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllPendingUpdates(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
): Promise<Account<PendingUpdate>[]> {
  const results = await rpc
    .getProgramAccounts(ACCORD_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(PENDING_UPDATE_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodePendingUpdate(parseBase64RpcAccount(pubkey as Address, account)),
  );
}
