/**
 * Canonical PDA derivations for Synod.
 *
 * All program addresses + seeds are sourced from generated code — no
 * hand-rolled byte constants:
 *   - Synod program address, SynodCase seeds → Codama output in
 *     `./generated/` (`SYNOD_PROGRAM_ADDRESS`, `findCasePda`).
 *   - Accord program address, Dispute seed → `@useaccord/sdk`, the single
 *     source for Accord PDA derivation (ADR-0010).
 *
 * `findBoundDisputePda` is a thin domain adapter over the Accord SDK's
 * `findDisputePda`: a case's single Accord dispute seeds
 * `["dispute", case_pda, 0]` — nonce 0, one dispute per case (SPEC §Invariants 2).
 *
 * @see ADR-0010
 */

import { findDisputePda } from "@useaccord/sdk";
import type { Address, ProgramDerivedAddress } from "@solana/kit";

export { SYNOD_PROGRAM_ADDRESS } from "./generated/programs/synod.js";
export { SYNOD_PROGRAM_ADDRESS as SYNOD_PROGRAM_ID } from "./generated/programs/synod.js";
export { ACCORD_PROGRAM_ADDRESS as ACCORD_PROGRAM_ID } from "@useaccord/sdk";
export { findCasePda, type CaseSeeds } from "./generated/pdas/case.js";

/** The Accord dispute bound to a case: `["dispute", case_pda, 0]` (nonce 0). */
export async function findBoundDisputePda(
  casePda: Address,
): Promise<ProgramDerivedAddress> {
  return findDisputePda({ filer: casePda, nonce: 0 });
}
