/**
 * evidence/index.ts — barrel for the `@useaccord/sdk/evidence` sub-path export.
 *
 * The Accord evidence encryption protocol + its Ed25519/X25519 key material,
 * shared byte-exact by claimant, operator (the evidence-daemon), and juror.
 * Kept behind a sub-path export so Arbitrables that only do `create_dispute`
 * CPI don't pull the `@noble` crypto stack.
 *
 * Authority: ADR-0006 (evidence model), ADR-0011 (evidence-daemon), SPEC §Crypto.
 */
export * from "./crypto.js";
export * from "./keys.js";
export * from "./ecies.js";
