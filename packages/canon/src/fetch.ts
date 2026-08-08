/**
 * Typed account fetchers — thin wrappers over the generated Kit client's
 * account codecs. Mirrors the Accord SDK `fetch.ts` pattern (ADR-0010).
 *
 * Each account type in `programs/canon/src/state.rs` has a pair:
 *   - `fetchX(canon, address)`  — throws if the account doesn't exist
 *   - `fetchXMaybe(canon, address)` — returns null if not found
 *
 * @see ADR-0010
 */

import type { Address } from "@solana/kit";

import type { Canon } from "./canon.js";

// --- CanonList (seeds: ["canon", creator, rules_hash]) ---

export function fetchCanonList(canon: Canon, address: Address) {
  return canon.client.canon.accounts.canonList.fetch(address);
}

export function fetchCanonListMaybe(canon: Canon, address: Address) {
  return canon.client.canon.accounts.canonList.fetchMaybe(address);
}

// --- CanonItem (seeds: ["canon-item", list, account]) ---

export function fetchCanonItem(canon: Canon, address: Address) {
  return canon.client.canon.accounts.canonItem.fetch(address);
}

export function fetchCanonItemMaybe(canon: Canon, address: Address) {
  return canon.client.canon.accounts.canonItem.fetchMaybe(address);
}
