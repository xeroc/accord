/**
 * queries.ts — typed `getProgramAccounts` wrappers for Accord accounts.
 *
 * The frontend must never construct memcmp filters or decode raw account
 * bytes (milestone uvru decision). These wrappers encapsulate the RPC
 * filter construction + decoding so consumers work with typed account data
 * only — no raw bytes leak to the UI layer.
 *
 * Pattern: raw Kit RPC + generated decoder → typed result.
 * The generated `fetchMaybeJurorStake(rpc, address)` already handles
 * single-account fetch; these are the multi-account (`getProgramAccounts`)
 * counterparts.
 *
 * @see ADR-0010, milestone accord-uvru "SDK gaps to fix"
 */

import {
  getBase64Encoder,
  type Address,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";
import {
  getJurorStakeDecoder,
  getJurorStakeSize,
  type JurorStake,
} from "./generated/accounts/jurorStake.js";

/** A decoded JurorStake with its on-chain address. */
export interface JurorStakeAccount extends JurorStake {
  address: Address;
}

/**
 * Fetch all JurorStake accounts belonging to a given Subaccord.
 *
 * Filters by memcmp at offset 8 (the `subaccord` field in the JurorStake
 * layout, immediately after the 8-byte discriminator) plus a dataSize filter
 * (129 bytes). Decodes each with the generated codec.
 *
 * Returns unsorted — callers (e.g. `prepareStakeProof`) sort by `treeIndex`.
 *
 * @param rpc       A raw Kit RPC (`createSolanaRpc(endpoint)`).
 * @param programId The Accord program address.
 * @param subaccord The Subaccord PDA to filter by.
 */
export async function findJurorStakesBySubaccord(
  rpc: Rpc<SolanaRpcApi>,
  programId: Address,
  subaccord: Address,
): Promise<JurorStakeAccount[]> {
  const accounts = await rpc
    .getProgramAccounts(programId, {
      encoding: "base64",
      filters: [
        { dataSize: BigInt(getJurorStakeSize()) },
        {
          memcmp: {
            offset: 8n,
            bytes: subaccord,
            encoding: "base58",
          },
        },
      ],
    })
    .send();

  const b64 = getBase64Encoder();
  const decoder = getJurorStakeDecoder();

  return accounts.map(({ pubkey, account }) => ({
    address: pubkey,
    ...decoder.decode(b64.encode(account.data[0])),
  }));
}
