/**
 * Typed `getProgramAccounts` query wrappers for Synod accounts (mirrors
 * @useaccord/canon's `queries.ts` — the read-only scan path the cranker
 * reconciler drives, bean accord-i1mp).
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
  SYNOD_CASE_DISCRIMINATOR,
  decodeSynodCase,
  type SynodCase,
} from "./generated/accounts/synodCase.js";
import { SYNOD_PROGRAM_ID } from "./pda.js";

export type QueryConfig = {
  commitment?: Commitment;
  abortSignal?: AbortSignal;
};

function discriminatorToBase64(d: ReadonlyUint8Array): Base64EncodedBytes {
  // ponytail: btoa for 8-byte discriminator — no perf concern
  return btoa(String.fromCharCode(...d)) as Base64EncodedBytes;
}

/**
 * Fetch every SynodCase account on-chain, decoded and typed.
 * Filters by the 8-byte account discriminator at offset 0.
 */
export async function findAllSynodCases(
  rpc: Rpc<GetProgramAccountsApi>,
  config?: QueryConfig,
): Promise<Account<SynodCase>[]> {
  const results = await rpc
    .getProgramAccounts(SYNOD_PROGRAM_ID, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: 0n,
            bytes: discriminatorToBase64(SYNOD_CASE_DISCRIMINATOR),
            encoding: "base64",
          },
        },
      ],
      commitment: config?.commitment,
    })
    .send();

  return results.map(({ pubkey, account }) =>
    decodeSynodCase(parseBase64RpcAccount(pubkey as Address, account)),
  );
}
