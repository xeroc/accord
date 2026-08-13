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
 * `create_list` is now shipped on-chain + in the SDK (`createList` facade).
 *
 * @see ADR-0010
 */

export { Canon, type CanonClient, type CanonConfig } from "./canon.js";
export {
  CANON_PROGRAM_ID,
  ACCORD_PROGRAM_ID,
  findCanonListPda,
  findCanonItemPda,
  findItemPda,
  findBackingSubaccordPda,
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
// Standalone generated fetchers — read accounts over a bare RPC, no signer.
// Mirrors @useaccord/sdk's `fetchMaybeSubaccord`/`fetchSubaccord` exports so
// read-only app hooks (Canon list/item views) never need a `Canon` client.
export {
  fetchMaybeCanonList,
  fetchMaybeCanonItem,
} from "./generated/accounts/index.js";
export {
  createList,
  submitItem,
  advancePending,
  challengeItem,
  settleItem,
  requestWithdrawal,
  advanceWithdrawal,
  type CreateListAccounts,
  type CreateListArgs,
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
