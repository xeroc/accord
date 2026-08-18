/**
 * @useaccord/synod — TypeScript SDK for the Accord Synod N-party
 * dispute-escrow Arbitrable on Solana.
 *
 * Synod is an Arbitrable that runs on top of Accord: it escrows equal stakes
 * from a named 2–7 party roster, files one dispute via CPI when the roster is
 * full, and pays the pot to the prevailing party from the Accord ruling.
 *
 * Current state: the on-chain program is a stub, and this index re-exports
 * only the raw Codama client generated from the Synod IDL
 * (`packages/synod/src/generated` — never hand-edited). The hand-written
 * facade (pda helpers, per-instruction methods, fetchers — mirroring
 * `@useaccord/canon` exactly) lands with the facade bean; until then there
 * are no instructions or accounts to wrap.
 *
 * @see ADR-0010
 */

export * from "./generated/index.js";

export const SDK_NAME = "@useaccord/synod";
export const SDK_VERSION = "0.1.0";
