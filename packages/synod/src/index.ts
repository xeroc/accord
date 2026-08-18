/**
 * @useaccord/synod — TypeScript SDK for the Accord Synod N-party
 * dispute-escrow Arbitrable on Solana.
 *
 * Synod is an Arbitrable that runs on top of Accord: it escrows equal stakes
 * from a named 2–7 party roster, files one dispute via CPI when the roster is
 * full, and pays the pot to the prevailing party from the Accord ruling.
 *
 * Public surface:
 *   - `Synod`            — facade class (primary entry point)
 *   - `pda`              — canonical PDA derivations (SynodCase + vault ATA)
 *   - `methods`          — per-instruction facades (openCase, join,
 *                          fileDispute, refundRosterMiss, claim)
 *   - `fetch`            — typed account fetchers (SynodCase)
 *   - `generated`        — raw Codama output (codecs, Ix builders, accounts)
 *
 * @see ADR-0010
 */

export { Synod, type SynodClient, type SynodConfig } from "./synod.js";
export {
  SYNOD_PROGRAM_ID,
  ACCORD_PROGRAM_ID,
  findSynodCasePda,
  findCaseVaultPda,
  type SynodCaseSeeds,
} from "./pda.js";
export { SYNOD_PROGRAM_ADDRESS } from "./synod.js";
export { fetchSynodCase, fetchSynodCaseMaybe } from "./fetch.js";
// Standalone generated fetchers — read accounts over a bare RPC, no signer.
// Mirrors @useaccord/sdk's / @useaccord/canon's `fetchMaybeX` exports so
// read-only consumers (and the jest e2e harness) never need a `Synod` client.
export { fetchMaybeSynodCase } from "./generated/accounts/index.js";
export {
  openCase,
  join,
  fileDispute,
  refundRosterMiss,
  claim,
  type OpenCaseAccounts,
  type OpenCaseArgs,
  type JoinAccounts,
  type FileDisputeAccounts,
  type FileDisputeExtras,
  type RefundRosterMissAccounts,
  type ClaimAccounts,
} from "./methods.js";

// Account codecs + decoders — exposed for advanced/test use (decode raw
// `getAccountInfo` bytes without a `ClientWithRpc`).
export {
  getSynodCaseEncoder,
  getSynodCaseCodec,
  getSynodCaseDecoder,
  SYNOD_CASE_DISCRIMINATOR,
} from "./generated/accounts/index.js";

// Re-export the domain type. The SynodCase struct lives in the generated
// accounts module; CaseState is a runtime enum from generated types.
export type { SynodCase, SynodCaseArgs } from "./generated/accounts/index.js";
export { CaseState } from "./generated/types/index.js";

export const SDK_NAME = "@useaccord/synod";
export const SDK_VERSION = "0.1.0";
