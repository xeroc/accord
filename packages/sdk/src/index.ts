/**
 * @veridao/sdk — TypeScript SDK for the VeriDAO Accord program on Solana.
 *
 * Public surface:
 *   - `Accord`         — facade class (primary entry point)
 *   - `wallet`         — signer adapter (Keypair | IWallet → Kit TransactionSigner)
 *   - `pda`            — canonical PDA derivations (all 8 accounts)
 *   - `constants`      — v1 protocol defaults and bounds
 *   - `errors`         — typed AccordError code map
 *   - `types`          — domain enums and structs (re-exported from generated)
 *   - `generated`      — raw Codama output (codecs, Ix builders, account fetchers)
 *   - `methods/*`      — per-instruction facades (dispute, voting, snapshot,
 *                        lifecycle, vrf, staking, appeal) over the Kit client
 *
 * @see ADR-0010
 */

export { Accord, type AccordClient, type AccordConfig } from "./accord";
export { createAccordAdapter, type AccordAdapter } from "./adapter";
export { createAccordMethods, type AccordMethods } from "./methods";
export {
  type AccordSigner,
  type IWallet,
  signerFromKeypairBytes,
  signerFromWallet,
} from "./wallet";
export {
  ACCORD_PROGRAM_ID,
  findAppealBondPda,
  findDisputePda,
  findJurorStakePda,
  findPauseStatePda,
  findPendingUpdatePda,
  findRoundPda,
  findSnapshotPda,
  findSubaccordPda,
} from "./pda";
export * from "./constants";
export {
  fetchAppealBond,
  fetchAppealBondMaybe,
  fetchDispute,
  fetchDisputeMaybe,
  fetchJurorStake,
  fetchJurorStakeMaybe,
  fetchPauseState,
  fetchPauseStateMaybe,
  fetchPendingUpdate,
  fetchPendingUpdateMaybe,
  fetchRound,
  fetchRoundMaybe,
  fetchSnapshot,
  fetchSnapshotMaybe,
  fetchSubaccord,
  fetchSubaccordMaybe,
} from "./fetch";
export {
  AccordErrors,
  ACCORD_ERROR_CODE_OFFSET,
  type AccordErrorCode,
  type AccordErrorName,
} from "./errors";
export * from "./types";

export const SDK_NAME = "@veridao/sdk";
export const SDK_VERSION = "0.1.0";

// Arbitrable CPI API — the primary external surface (ADR-0010, bean veridao-50qy).
export * from "./methods/dispute.js";

// Commit-reveal voting + finalization cranks + the commit-hash helper
// (ADR-0010, bean veridao-a0mc).
export * from "./methods/voting.js";

// Snapshot trust (post/challenge/finalize) + Merkle-Sum Tree membership builder
// for ADR-0009 sortition (ADR-0010, bean veridao-dsc2).
// NOTE: LeafClaim/MSTNode/JurorMembership are intentionally NOT re-exported
// here — the canonical (generated) types from ./types are the public API.
// snapshot.ts keeps byte-oriented variants for internal MST crypto.
export {
  type MerkleSumTree,
  leafHash,
  buildMst,
  proveMembership,
  selectSlot,
  buildMemberships,
  verifyMstInclusion,
  snapshotSeeds,
  type SnapshotAccounts,
  type AccordSnapshotClient,
  postSnapshot,
  challengeSnapshot,
  finalizeSnapshot,
} from "./methods/snapshot.js";

// Subaccord lifecycle + circuit breaker (ADR-0005/0007) + timelock helpers
// (ADR-0010, bean veridao-erv7).
export * from "./methods/lifecycle.js";

// VRF request + draw choreography + sortition slot derivation (ADR-0009 §2,
// ADR-0010, bean veridao-j7tx).
export * from "./methods/vrf.js";

// Juror capital stake / unstake + the active_draws typed guard (ADR-0003/0007,
// ADR-0010, bean veridao-o8ki).
export * from "./methods/staking.js";

// Dispute appeal + bond refund + appeal-ladder math (ADR-0004, ADR-0010,
// bean veridao-yny6).
export * from "./methods/appeal.js";
