/**
 * Typed account fetchers — thin wrappers over the generated Kit client's
 * account codecs.
 *
 * Each account type in `programs/accord/src/state.rs` has a pair:
 *   - `fetchX(accord, address)`  — throws if the account doesn't exist
 *   - `fetchXMaybe(accord, address)` — returns null if not found
 *
 * The generated client already provides `fetch`/`fetchMaybe` via
 * `addSelfFetchFunctions`; these wrappers give a single import surface
 * and accept the `Accord` facade directly.
 *
 * @see ADR-0010
 */

import type { Address } from "@solana/kit";

import type { Accord } from "./accord";

// --- Subaccord (seeds: ["subaccord", creator, risk_type]) ---

export function fetchSubaccord(accord: Accord, address: Address) {
  return accord.client.accord.accounts.subaccord.fetch(address);
}

export function fetchSubaccordMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.subaccord.fetchMaybe(address);
}

// --- JurorStake (seeds: ["stake", subaccord, juror]) ---

export function fetchJurorStake(accord: Accord, address: Address) {
  return accord.client.accord.accounts.jurorStake.fetch(address);
}

export function fetchJurorStakeMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.jurorStake.fetchMaybe(address);
}

// --- Dispute (seeds: ["dispute", filer, nonce]) ---

export function fetchDispute(accord: Accord, address: Address) {
  return accord.client.accord.accounts.dispute.fetch(address);
}

export function fetchDisputeMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.dispute.fetchMaybe(address);
}

// --- Round (seeds: ["round", dispute, round_idx]; zero-copy) ---

export function fetchRound(accord: Accord, address: Address) {
  return accord.client.accord.accounts.round.fetch(address);
}

export function fetchRoundMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.round.fetchMaybe(address);
}

// --- PendingUpdate (seeds: ["update", subaccord, nonce]) ---

export function fetchPendingUpdate(accord: Accord, address: Address) {
  return accord.client.accord.accounts.pendingUpdate.fetch(address);
}

export function fetchPendingUpdateMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.pendingUpdate.fetchMaybe(address);
}

// --- AppealBond (seeds: ["bond", dispute, round_idx]) ---

export function fetchAppealBond(accord: Accord, address: Address) {
  return accord.client.accord.accounts.appealBond.fetch(address);
}

export function fetchAppealBondMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.appealBond.fetchMaybe(address);
}

// --- PauseState (singleton, seeds: ["pause"]) ---

export function fetchPauseState(accord: Accord, address: Address) {
  return accord.client.accord.accounts.pauseState.fetch(address);
}

export function fetchPauseStateMaybe(accord: Accord, address: Address) {
  return accord.client.accord.accounts.pauseState.fetchMaybe(address);
}
