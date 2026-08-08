/**
 * Canonical PDA derivations for every Canon account.
 *
 * Seeds sourced from `programs/canon/src/state.rs` + `constants.rs`:
 *   SEED_CANON_LIST = "canon"       SEED_CANON_ITEM = "canon-item"
 *
 * CanonList:  ["canon", creator, rules_hash]  — hand-written (Codama can't
 *   encode it statically: seeds reference account fields, not instruction args;
 *   same situation as the Accord SDK's hand-written `findRoundPda`).
 * CanonItem:  ["canon-item", list, account]   — re-exported from generated.
 *
 * @see ADR-0010
 */

import {
  getAddressEncoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  type Address,
  type ProgramDerivedAddress,
} from "@solana/kit";

export { findItemPda, type ItemSeeds } from "./generated/pdas/item.js";

// --- Program identity -------------------------------------------------------

export const CANON_PROGRAM_ID =
  "GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU" as Address<"GYvMBmzi6w2PPuK8tPGnnNsVprzWeNBecete3Jp6aeKU">;

// --- Hand-written CanonList PDA --------------------------------------------
// Seeds: ["canon", creator, rules_hash]. Codama omits this because the seeds
// reference `CanonList.creator` + `CanonList.rules_hash` (account fields), not
// instruction arguments — it cannot encode them statically.

const CANON_LIST_SEED = new Uint8Array([99, 97, 110, 111, 110]); // b"canon"

export type CanonListSeeds = {
  creator: Address;
  rulesHash: Uint8Array; // [u8; 32]
};

export async function findCanonListPda(
  seeds: CanonListSeeds,
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  const { programAddress = CANON_PROGRAM_ID } = config;
  return await getProgramDerivedAddress({
    programAddress,
    seeds: [
      getBytesEncoder().encode(CANON_LIST_SEED),
      getAddressEncoder().encode(seeds.creator),
      getBytesEncoder().encode(seeds.rulesHash),
    ],
  });
}

// --- Convenience alias matching the bean naming -----------------------------
// `canonItemPda(list, account)` — delegates to the generated `findItemPda`.

export async function findCanonItemPda(
  list: Address,
  account: Address,
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  const { findItemPda } = await import("./generated/pdas/item.js");
  return findItemPda({ list, account }, config);
}
