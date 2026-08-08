/**
 * Typed account fetchers — thin re-exports of the generated Kit fetchers.
 *
 * The generated account modules (`./generated/accounts/*`) already export
 * `fetchX(rpc, address)` / `fetchMaybeX(rpc, address)` that work over a raw
 * Kit `Rpc` (e.g. `createSolanaRpc(...)` or `Accord#rpc`). Earlier wrappers
 * here routed through `accord.client`, which requires a `ClientWithRpc` and
 * breaks when the facade is built over a bare RPC — so we delegate to the
 * generated functions directly and pass `rpc` as the first argument.
 *
 * Each returns a fully typed `Account<T>` (or `MaybeAccount<T>`); no raw bytes
 * leak to the caller. `fetchXMaybe` aliases the generated `fetchMaybeX` name to
 * keep the public API stable.
 *
 * @see ADR-0010
 */

export {
  fetchAppealBond,
  fetchMaybeAppealBond as fetchAppealBondMaybe,
} from "./generated/accounts/appealBond.js";
export {
  fetchDispute,
  fetchMaybeDispute as fetchDisputeMaybe,
} from "./generated/accounts/dispute.js";
export {
  fetchJurorStake,
  fetchMaybeJurorStake as fetchJurorStakeMaybe,
} from "./generated/accounts/jurorStake.js";
export {
  fetchPauseState,
  fetchMaybePauseState as fetchPauseStateMaybe,
} from "./generated/accounts/pauseState.js";
export {
  fetchPendingUpdate,
  fetchMaybePendingUpdate as fetchPendingUpdateMaybe,
} from "./generated/accounts/pendingUpdate.js";
export {
  fetchRound,
  fetchMaybeRound as fetchRoundMaybe,
} from "./generated/accounts/round.js";
export {
  fetchSubaccord,
  fetchMaybeSubaccord as fetchSubaccordMaybe,
} from "./generated/accounts/subaccord.js";
