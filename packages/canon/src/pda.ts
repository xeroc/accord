/**
 * Canonical PDA derivations for every Canon account.
 *
 * All program addresses + seeds are sourced from generated code — no
 * hand-rolled byte constants:
 *   - Canon program address, CanonList/CanonItem seeds → Codama output in
 *     `./generated/` (`CANON_PROGRAM_ADDRESS`, `findListPda`, `findItemPda`).
 *   - Accord program address, Subaccord seed → `@useaccord/sdk`, the single
 *     source for Accord PDA derivation (ADR-0010).
 *
 * CanonList: ["canon", creator, rules_hash] — re-exported from generated
 *   (Codama encodes the seed statically).
 * CanonItem: ["canon-item", list, account] — re-exported from generated.
 *
 * `findBackingSubaccordPda` is a thin domain adapter over the Accord SDK's
 * `findSubaccordPda`: a CanonList's 1:1 backing court seeds
 * `["subaccord", creator, rules_hash]` where domain_ref := rules_hash.
 *
 * @see ADR-0010
 */

import type { Address, ProgramDerivedAddress } from "@solana/kit";
import { findSubaccordPda } from "@useaccord/sdk";

import { findItemPda } from "./generated/pdas/item.js";
import type { ListSeeds as CanonListSeeds } from "./generated/pdas/list.js";

// --- Program identity (single source: generated) -----------------------------

/** Canon program address — sourced from the generated Codama client. */
export {
  CANON_PROGRAM_ADDRESS as CANON_PROGRAM_ID,
} from "./generated/programs/canon.js";

/** Accord Core program address — the CPI target `create_list` calls
 * (`create_subaccord`). Sourced from `@useaccord/sdk`'s generated client. */
export { ACCORD_PROGRAM_ADDRESS as ACCORD_PROGRAM_ID } from "@useaccord/sdk";

// --- Generated CanonList + CanonItem PDAs ------------------------------------
// Codama emits both; re-exported unchanged under the canon domain names.

/** CanonList PDA: seeds ["canon", creator, rules_hash]. */
export { findListPda as findCanonListPda } from "./generated/pdas/list.js";
export type { ListSeeds as CanonListSeeds } from "./generated/pdas/list.js";
export { findItemPda, type ItemSeeds } from "./generated/pdas/item.js";

// --- Convenience alias matching the bean naming ------------------------------

/** `findCanonItemPda(list, account)` — positional-arg alias for the generated
 * `findItemPda({ list, account })`. */
export async function findCanonItemPda(
  list: Address,
  account: Address,
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  return findItemPda({ list, account }, config);
}

// --- 1:1 backing Subaccord (Accord PDA via @useaccord/sdk) -------------------

/** The 1:1 backing Subaccord for a CanonList. Canon's `rules_hash` IS the
 * Subaccord's `domain_ref`; delegating to `findSubaccordPda` keeps the Accord
 * SDK the single source for that derivation (ADR-0010). */
export async function findBackingSubaccordPda(
  seeds: CanonListSeeds,
): Promise<ProgramDerivedAddress> {
  return findSubaccordPda({
    creator: seeds.creator,
    domainRef: seeds.rulesHash,
  });
}
