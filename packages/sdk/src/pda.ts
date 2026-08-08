/**
 * Canonical PDA derivations for every Accord account.
 *
 * Seeds sourced from `programs/accord/src/state.rs` + `constants.rs`:
 *   SEED_SUBACCORD = "subaccord"   SEED_DISPUTE = "dispute"
 *   SEED_JUROR_STAKE = "stake"     SEED_ROUND = "round"
 *   SEED_PENDING_UPDATE = "update" SEED_APPEAL_BOND = "bond"
 *   SEED_PAUSE = "pause"
 *
 * Five of seven PDAs are emitted by Codama into `./generated/pdas/` and
 * re-exported here unchanged. `Round` is hand-written because its on-chain seeds
 * reference `dispute.key()` (a runtime address, not a static field) — Codama
 * cannot encode that statically, so it omits it.
 *
 * ADR-0012: the `Snapshot` PDA is gone (snapshot layer deleted).
 *
 * Every function returns `ProgramDerivedAddress` = `{ address: Address; bump: number }`.
 *
 * @see ADR-0010
 */

import {
  getAddressEncoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  getU32Encoder,
  type Address,
  type ProgramDerivedAddress,
} from "@solana/kit";

// --- Program identity -------------------------------------------------------

export const ACCORD_PROGRAM_ID =
  "cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed" as Address<"cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed">;

// --- Re-exported generated PDA helpers (5/7) ---------------------------------

export {
  findAppealBondPda,
  type AppealBondSeeds,
} from "./generated/pdas/appealBond";
export { findDisputePda, type DisputeSeeds } from "./generated/pdas/dispute";
export {
  findJurorStakePda,
  type JurorStakeSeeds,
} from "./generated/pdas/jurorStake";
export { findPauseStatePda } from "./generated/pdas/pauseState";
export {
  findPendingUpdatePda,
  type PendingUpdateSeeds,
} from "./generated/pdas/pendingUpdate";
export {
  findSubaccordPda,
  type SubaccordSeeds,
} from "./generated/pdas/subaccord";

// --- Hand-written PDA helper (1/7) ------------------------------------------
// Round: seeds use `dispute.key()` (the account address), which Codama can't
// statically encode. Same encoding pattern as AppealBond:
// [seed_bytes, dispute_address, u32_le(round_idx)].

const ROUND_SEED = new Uint8Array([114, 111, 117, 110, 100]); // b"round"

export type RoundSeeds = {
  dispute: Address;
  roundIdx: number;
};

export async function findRoundPda(
  seeds: RoundSeeds,
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  const { programAddress = ACCORD_PROGRAM_ID } = config;
  return await getProgramDerivedAddress({
    programAddress,
    seeds: [
      getBytesEncoder().encode(ROUND_SEED),
      getAddressEncoder().encode(seeds.dispute),
      getU32Encoder().encode(seeds.roundIdx),
    ],
  });
}
