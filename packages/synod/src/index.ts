/**
 * @useaccord/synod — TypeScript SDK for the Accord Synod N-party
 * dispute-escrow Arbitrable on Solana.
 *
 * Synod is an Arbitrable that runs on top of Accord: it escrows equal stakes
 * from a named 2–7 party roster, files one dispute via CPI when the roster is
 * full, and pays the pot to the prevailing party from the Accord ruling.
 *
 * Public surface (mirrors @useaccord/canon):
 *   - `Synod`            — facade class over the generated Kit client
 *                          (read path: `synod.client.synod.accounts.*`)
 *   - `pda`              — canonical PDA derivations (SynodCase + vault ATA
 *                          + bound dispute)
 *   - `methods`          — per-instruction facades (openCase, join, fileDispute,
 *                          refundRosterMiss, claim)
 *   - `fetch`            — standalone generated account fetchers (SynodCase)
 *   - `queries`          — decoded `getProgramAccounts` scans (findAllSynodCases)
 *   - `generated`        — raw Codama output (codecs, Ix builders, accounts)
 *
 * @see ADR-0010
 */

export { Synod, type SynodClient, type SynodConfig } from "./synod.js";
export { SYNOD_PROGRAM_ADDRESS } from "./synod.js";
export {
  SYNOD_PROGRAM_ID,
  ACCORD_PROGRAM_ID,
  findCasePda,
  findBoundDisputePda,
  findCaseVaultPda,
  type CaseSeeds,
} from "./pda.js";
// Milestone-lane alias (accord-nsxa facade).
export { findSynodCasePda, type SynodCaseSeeds } from "./pda.js";
export {
  fetchSynodCase,
  fetchMaybeSynodCase,
  type SynodCase,
} from "./fetch.js";
// Raw codecs/decoders for `getAccountInfo`-based decoding (e2e harness rule).
export {
  getSynodCaseEncoder,
  getSynodCaseCodec,
  getSynodCaseDecoder,
  SYNOD_CASE_DISCRIMINATOR,
} from "./generated/accounts/index.js";
export { findAllSynodCases, type QueryConfig } from "./queries.js";
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
export { CaseState } from "./generated/types/index.js";
export type { SynodCaseArgs } from "./generated/accounts/index.js";

export const SDK_NAME = "@useaccord/synod";
export const SDK_VERSION = "0.1.0";
