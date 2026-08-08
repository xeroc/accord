/**
 * @useaccord/sdk — TypeScript SDK for the VeriDAO Accord program on Solana.
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
  fetchSubaccord,
  fetchSubaccordMaybe,
} from "./fetch";
export {
  findAllSubaccords,
  findDisputesByFiler,
  findDisputesBySubaccord,
  findJurorStakesByJuror,
  findJurorStakesBySubaccord,
} from "./query";
export {
  AccordErrors,
  ACCORD_ERROR_CODE_OFFSET,
  type AccordErrorCode,
  type AccordErrorName,
} from "./errors";
export * from "./types";

export const SDK_NAME = "@useaccord/sdk";
export const SDK_VERSION = "0.1.0";

// Arbitrable CPI API — the primary external surface (ADR-0010, bean veridao-50qy).
export * from "./methods/dispute.js";

// Commit-reveal voting + finalization cranks + the commit-hash helper
// (ADR-0010, bean veridao-a0mc).
export * from "./methods/voting.js";

// Stake accumulator (ADR-0012): subtree-sum MST builder + proofs — the
// byte-exact reference the on-chain verifier matches. Used by `stake`/
// `requestWithdraw`/`reconcileStake` (path) and `draw_seat` (membership +
// sortition prefix).
export {
  type MerkleAccumulator,
  type MSTNode,
  type LeafClaim,
  leafHash,
  emptyRoot,
  buildAccumulator,
  proofFor,
  recomputeRoot,
  verifyMembership,
} from "./methods/mst.js";

// Subaccord lifecycle + circuit breaker (ADR-0005/0007) + timelock helpers
// (ADR-0010, bean veridao-erv7).
export * from "./methods/lifecycle.js";

// VRF request + per-seat draw_seat choreography + sortition slot derivation
// (ADR-0009 §2 + ADR-0012, bean veridao-j7tx).
export * from "./methods/vrf.js";

// Juror capital stake / two-phase withdraw (requestWithdraw + withdraw) +
// reconcileStake crank + the active_draws typed guard (ADR-0003/0007/0012,
// REVIEW #4/#5, bean veridao-o8ki).
export * from "./methods/staking.js";

// Per-round settlement crank + dispute cancellation (settleRound / cancelDispute,
// ADR-0010, bean accord-dedf).
export * from "./methods/settlement.js";

// Dispute appeal + bond refund + appeal-ladder math (ADR-0004, ADR-0010,
// bean veridao-yny6).
export * from "./methods/appeal.js";

// Stake / unstake MST accumulator proof orchestration (ADR-0012, bean
// accord-bko6). Given a Subaccord's accumulator state + all its JurorStake
// accounts, builds the canonical tree, verifies the root, and returns the
// Merkle proof for stake / requestWithdraw / reconcileStake.
export {
  prepareStakeProof,
  type SubaccordAccumulatorView,
  type JurorStakeLeaf,
  type StakeProofResult,
} from "./methods/stakeFlow.js";

// Dispute phase label + countdown for the juror dashboard (bean accord-m4gt).
export {
  disputePhase,
  type RoundPhaseWindows,
  type PhaseInfo,
} from "./methods/disputePhase.js";

// Account codecs — exposed for advanced/test use (e.g. e2e VRF injection via
// `surfnet_setAccount`: decode → set committedVrf → re-encode). Generated surface.
export {
  getDisputeEncoder,
  getDisputeCodec,
  DISPUTE_DISCRIMINATOR,
} from "./generated/accounts/dispute.js";

// Account decoders — pure (no `client.rpc`). The facade's typed fetchers
// (`fetchX`) currently require a `ClientWithRpc` and break when the facade is
// built over a raw `createSolanaRpc`; until that's fixed, read accounts via
// raw `getAccountInfo` + these decoders.
//
// Generated `fetchMaybe*` functions work directly with a raw Kit RPC and return
// typed `MaybeAccount<T>` — the correct read path for the frontend and tests.
export {
  type AppealBond,
  fetchMaybeAppealBond,
  fetchMaybeDispute,
  fetchMaybeJurorStake,
  fetchMaybePauseState,
  fetchMaybePendingUpdate,
  fetchMaybeRound,
  fetchMaybeSubaccord,
  getAppealBondDecoder,
  getDisputeDecoder,
  getJurorStakeDecoder,
  getPauseStateDecoder,
  getPendingUpdateDecoder,
  getRoundDecoder,
  getSubaccordDecoder,
  type Dispute,
  type Round,
  type Subaccord,
} from "./generated/accounts/index.js";

// Typed getProgramAccounts query wrappers — no raw bytes leak to the caller
// (ADR-0010, bean accord-3f19/accord-bp9y).
export { findAllDisputes, type QueryConfig } from "./queries.js";
