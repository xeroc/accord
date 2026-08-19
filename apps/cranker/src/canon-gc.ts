/**
 * canon-gc.ts — Removed-canon-item discovery shared by the reconciler sweep
 * and the canon WS listener (bean accord-m5fd).
 *
 * One server-side-filtered `getProgramAccounts` query: CanonItem accounts
 * (discriminator memcmp at offset 0) in the `Removed` state (state-byte memcmp
 * at {@link CANON_ITEM_STATE_OFFSET}), with a zero-length dataSlice — the
 * cranker only needs addresses; the close_item executor re-fetches each
 * account for its state + profitability guards.
 *
 * `CANON_ITEM_STATE_OFFSET` is pinned to the generated account layout
 * (8-byte discriminator + account/list/submitter 3×32 = 104).
 * canon-gc.test.ts re-encodes a CanonItem with the generated encoder and
 * fails if the layout ever drifts.
 */
import {
  type Address,
  type Base64EncodedBytes,
  getBase64Decoder,
  type GetProgramAccountsApi,
  type GetProgramAccountsMemcmpFilter,
  type ReadonlyUint8Array,
  type Rpc,
} from "@solana/kit";
import { CANON_ITEM_DISCRIMINATOR, CANON_PROGRAM_ID, ItemState } from "@useaccord/canon";

/** Byte offset of `CanonItem.state` in the account data. */
export const CANON_ITEM_STATE_OFFSET = 104n;

/** Raw bytes → base64 text (kit's base64 "decoder" decodes bytes INTO base64). */
function toBase64(bytes: ReadonlyUint8Array): Base64EncodedBytes {
  return getBase64Decoder().decode(bytes) as Base64EncodedBytes;
}

/** memcmp filter matching a CanonItem `state` byte. */
export function canonItemStateFilter(state: ItemState): GetProgramAccountsMemcmpFilter {
  return {
    memcmp: {
      offset: CANON_ITEM_STATE_OFFSET,
      bytes: toBase64(Uint8Array.of(state)),
      encoding: "base64",
    },
  };
}

/** The two server-side filters that select Removed CanonItem accounts. */
export function removedCanonItemFilters(): GetProgramAccountsMemcmpFilter[] {
  return [
    { memcmp: { offset: 0n, bytes: toBase64(CANON_ITEM_DISCRIMINATOR), encoding: "base64" } },
    canonItemStateFilter(ItemState.Removed),
  ];
}

/** Every CanonItem PDA currently in `Removed` state (addresses only). */
export async function findRemovedCanonItemAddresses(
  rpc: Rpc<GetProgramAccountsApi>,
  programId: Address = CANON_PROGRAM_ID,
): Promise<Address[]> {
  const results = await rpc
    .getProgramAccounts(programId, {
      encoding: "base64",
      filters: removedCanonItemFilters(),
      dataSlice: { offset: 0, length: 0 },
    })
    .send();
  return results.map((r) => r.pubkey as Address);
}
