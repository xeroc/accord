/**
 * evidence/index.ts — barrel for the `@useaccord/sdk/evidence` sub-path export.
 *
 * The Accord evidence encryption protocol + the manifest / option-hash /
 * publish helpers shared byte-exact by claimant, operator (the
 * evidence-daemon), and juror. Kept behind a sub-path export so Arbitrables
 * that only do `create_dispute` CPI don't pull the `@noble` crypto stack.
 *
 * The daemon base URL (`EVIDENCE_DAEMON_URL`) is deployment-specific and stays
 * app-side; `publishEvidence` takes `endpoint` as a parameter (ADR-0011).
 *
 * Authority: ADR-0006 (evidence model), ADR-0011 (evidence-daemon), ADR-0015
 * (evidence crypto → SDK), SPEC §Crypto, EVIDENCE-FORMAT.md.
 */
export * from "./crypto.js";
export * from "./keys.js";
export * from "./ecies.js";
export * from "./manifest.js";
export * from "./options.js";
export * from "./parse.js";
export * from "./publish.js";
