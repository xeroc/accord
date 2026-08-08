/**
 * @useaccord/canon — TypeScript SDK for the Accord Canon curated-list
 * Arbitrable on Solana.
 *
 * Canon is an Arbitrable that runs on top of Accord: it owns the item
 * lifecycle + item deposits; Accord owns juror staking, the VRF draw,
 * commit-reveal voting, and the ruling.
 *
 * Public surface:
 *   - `Canon`            — facade class (primary entry point)
 *   - `pda`              — canonical PDA derivations (CanonList + CanonItem)
 *   - `methods`          — per-instruction facades (submit, advance, challenge,
 *                          settle, requestWithdrawal, advanceWithdrawal)
 *   - `fetch`            — typed account fetchers (CanonList, CanonItem)
 *   - `generated`        — raw Codama output (codecs, Ix builders, accounts)
 *
 * `create_list` is not yet shipped on-chain (bean accord-73yx); a `createList`
 * facade will land with it.
 *
 * @see ADR-0010
 */

export { Canon, type CanonClient, type CanonConfig } from "./canon.js";
export {
  CANON_PROGRAM_ID,
  findCanonListPda,
  findCanonItemPda,
  findItemPda,
  type CanonListSeeds,
  type ItemSeeds,
} from "./pda.js";
export { CANON_PROGRAM_ADDRESS } from "./canon.js";
export {
  fetchCanonList,
  fetchCanonListMaybe,
  fetchCanonItem,
  fetchCanonItemMaybe,
} from "./fetch.js";
export {
  submitItem,
  advancePending,
  challengeItem,
  settleItem,
  requestWithdrawal,
  advanceWithdrawal,
  type SubmitItemAccounts,
  type AdvancePendingAccounts,
  type ChallengeItemAccounts,
  type ChallengeItemExtras,
  type SettleItemAccounts,
  type RequestWithdrawalAccounts,
  type AdvanceWithdrawalAccounts,
} from "./methods.js";

// Account codecs + decoders — exposed for advanced/test use (decode raw
// `getAccountInfo` bytes without a `ClientWithRpc`).
export {
  getCanonListEncoder,
  getCanonListCodec,
  getCanonListDecoder,
  CANON_LIST_DISCRIMINATOR,
  getCanonItemEncoder,
  getCanonItemCodec,
  getCanonItemDecoder,
  CANON_ITEM_DISCRIMINATOR,
} from "./generated/accounts/index.js";

// Re-export the domain types. CanonList/CanonItem structs live in the
// generated accounts module; ItemState is a runtime enum from generated types.
export type {
  CanonList,
  CanonItem,
  CanonListArgs,
  CanonItemArgs,
} from "./generated/accounts/index.js";
export { ItemState } from "./generated/types/index.js";

export const SDK_NAME = "@useaccord/canon";
export const SDK_VERSION = "0.1.0";
