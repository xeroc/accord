/**
 * Canonical PDA derivations for every Accord account.
 *
 * Seeds sourced from `programs/accord/src/state.rs` + `constants.rs`:
 *   SEED_SUBACCORD = "subaccord"   SEED_DISPUTE = "dispute"
 *   SEED_JUROR_STAKE = "stake"     SEED_ROUND = "round"
 *   SEED_SNAPSHOT = "snapshot"     SEED_PENDING_UPDATE = "update"
 *   SEED_APPEAL_BOND = "bond"      SEED_PAUSE = "pause"
 *
 * Six of eight PDAs are emitted by Codama into `./generated/pdas/` and
 * re-exported here unchanged. `Round` and `Snapshot` are hand-written because
 * their on-chain seeds reference `dispute.key()` (a runtime address, not a
 * static field) — Codama cannot encode that statically, so it omits them.
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
  "RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe" as Address<"RokLJyruq34Ubtaj8mFnQETKcZpNCbW6k6xsgrMoHEe">;

// --- Re-exported generated PDA helpers (6/8) ---------------------------------

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

// --- Hand-written PDA helpers (2/8) -----------------------------------------
// Round + Snapshot: seeds use `dispute.key()` (the account address), which
// Codama can't statically encode. Same encoding pattern as AppealBond:
// [seed_bytes, dispute_address, u32_le(round_idx)].

const ROUND_SEED = new Uint8Array([114, 111, 117, 110, 100]); // b"round"
const SNAPSHOT_SEED = new Uint8Array([115, 110, 97, 112, 115, 104, 111, 116]); // b"snapshot"

export type RoundSeeds = {
  dispute: Address;
  roundIdx: number;
};

export type SnapshotSeeds = {
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

export async function findSnapshotPda(
  seeds: SnapshotSeeds,
  config: { programAddress?: Address } = {},
): Promise<ProgramDerivedAddress> {
  const { programAddress = ACCORD_PROGRAM_ID } = config;
  return await getProgramDerivedAddress({
    programAddress,
    seeds: [
      getBytesEncoder().encode(SNAPSHOT_SEED),
      getAddressEncoder().encode(seeds.dispute),
      getU32Encoder().encode(seeds.roundIdx),
    ],
  });
}
