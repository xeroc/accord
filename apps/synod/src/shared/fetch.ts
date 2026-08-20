/**
 * fetch.ts — typed account reads over a raw Kit RPC (read-only — no signer).
 *
 * `findAllSynodCases`: typed `getProgramAccounts` scan over the Synod program
 * (discriminator filter), fully decoded — the home browser + inbox read.
 * Mirrors apps/canon's findAllCanonLists.
 */

import {
  decodeAccount,
  parseBase64RpcAccount,
  type Account,
  type Address,
  type Base64EncodedBytes,
  type GetProgramAccountsApi,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";
import {
  SYNOD_CASE_DISCRIMINATOR,
  SYNOD_PROGRAM_ID,
  getSynodCaseDecoder,
  type SynodCase,
} from "@useaccord/synod";

/** Convert an 8-byte discriminator to a base64 RPC memcmp filter value. */
function discriminatorToBase64(d: ReadonlyUint8Array): Base64EncodedBytes {
  return btoa(String.fromCharCode(...d)) as Base64EncodedBytes;
}

/** Every SynodCase on chain, decoded and typed.
 * ponytail: unbounded GPA — paginate server-side if case volume explodes. */
export async function findAllSynodCases(
  rpc: Rpc<GetProgramAccountsApi>,
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
    })
    .send();
  return results.map(({ pubkey, account }) =>
    decodeAccount(parseBase64RpcAccount(pubkey as Address, account), getSynodCaseDecoder()),
  );
}
