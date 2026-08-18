/**
 * Canonical PDA derivations for every Synod account.
 *
 * All program addresses + seeds are sourced from generated code — no
 * hand-rolled byte constants (ADR-0010):
 *   - Synod program address, SynodCase seeds → Codama output in
 *     `./generated/` (`SYNOD_PROGRAM_ADDRESS`, `findCasePda`).
 *   - Accord program address, ATA layout → `@useaccord/sdk`, the single
 *     source for Accord identity + ATA derivation (ADR-0010/0020).
 *
 * SynodCase: ["case", opener, nonce] — re-exported from generated (Codama
 *   encodes the seed statically).
 *
 * `findCaseVaultPda` is a thin domain adapter over the Accord SDK's
 * `findAssociatedTokenAddress`: the case escrow vault is the SynodCase-PDA
 * -owned ATA of the Subaccord `fee_token` (the single escrow mint,
 * ADR-0020) — lazily created on first `join` (canon precedent).
 *
 * @see ADR-0010
 */

import type { Address } from "@solana/kit";
import { findAssociatedTokenAddress } from "@useaccord/sdk";

// --- Program identity (single source: generated) -----------------------------

/** Synod program address — sourced from the generated Codama client. */
export {
  SYNOD_PROGRAM_ADDRESS as SYNOD_PROGRAM_ID,
} from "./generated/programs/synod.js";

/** Accord Core program address — the CPI target `file_dispute` calls
 * (`create_dispute`). Sourced from `@useaccord/sdk`'s generated client. */
export { ACCORD_PROGRAM_ADDRESS as ACCORD_PROGRAM_ID } from "@useaccord/sdk";

// --- Generated SynodCase PDA --------------------------------------------------

/** SynodCase PDA: seeds ["case", opener, nonce]. */
export { findCasePda as findSynodCasePda } from "./generated/pdas/case.js";
export type { CaseSeeds as SynodCaseSeeds } from "./generated/pdas/case.js";

// --- Case vault ATA (case-PDA-owned, via @useaccord/sdk) ----------------------

/** The case escrow vault: the `feeMint` ATA owned by the SynodCase PDA.
 * Argument order mirrors `findAssociatedTokenAddress(mint, owner)`; the
 * delegation keeps the Accord SDK the single source for the ATA layout
 * (ADR-0010). */
export function findCaseVaultPda(
  feeMint: Address,
  casePda: Address,
): Promise<Address> {
  return findAssociatedTokenAddress(feeMint, casePda);
}
