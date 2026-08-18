/**
 * Typed account fetchers — thin wrappers over the generated Kit client's
 * account codecs. Mirrors the Accord/Canon SDK `fetch.ts` pattern (ADR-0010).
 *
 * Each account type in `programs/synod/src/state.rs` has a pair:
 *   - `fetchSynodCase(synod, address)`  — throws if the account doesn't exist
 *   - `fetchSynodCaseMaybe(synod, address)` — returns null if not found
 *
 * For reads over a bare Kit RPC (no `Synod` client / signer), use the
 * standalone generated fetchers re-exported from `index.ts`
 * (`fetchMaybeSynodCase`) — the path the jest e2e harness depends on.
 *
 * @see ADR-0010
 */

import type { Address } from "@solana/kit";

import type { Synod } from "./synod.js";

// --- SynodCase (seeds: ["case", opener, nonce]) ---

export function fetchSynodCase(synod: Synod, address: Address) {
  return synod.client.synod.accounts.synodCase.fetch(address);
}

export function fetchSynodCaseMaybe(synod: Synod, address: Address) {
  return synod.client.synod.accounts.synodCase.fetchMaybe(address);
}
