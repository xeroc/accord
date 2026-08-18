/**
 * Typed account fetchers for Synod (mirrors @useaccord/canon's standalone
 * generated fetchers — the read-only path that needs no client).
 *
 * `fetchSynodCase(rpc, address)` throws when the account is absent;
 * `fetchMaybeSynodCase(rpc, address)` returns `null`. Raw codecs/decoders for
 * `getAccountInfo`-based decoding are re-exported from `index.ts`
 * (AGENTS.md setup/assertions rule).
 *
 * @see ADR-0010
 */

export {
  fetchSynodCase,
  fetchMaybeSynodCase,
  type SynodCase,
} from "./generated/accounts/index.js";
