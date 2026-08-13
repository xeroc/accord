/**
 * evidence/index.ts — barrel for the `@useaccord/sdk/evidence` sub-path export.
 *
 * The Accord evidence encryption protocol + its Ed25519/X25519 key material,
 * shared byte-exact by claimant, operator (the evidence-daemon), and juror.
 * Also includes the manifest builder/parser/publisher (the `accord-evidence/v1`
 * wire format) extracted from apps/app (ADR-0015).
 *
 * Kept behind a sub-path export so Arbitrables that only do `create_dispute`
 * CPI don't pull the `@noble` crypto stack.
 *
 * The daemon base URL (`EVIDENCE_DAEMON_URL`) is deployment-specific and stays
 * app-side; `publishEvidence` takes `endpoint` as a parameter (ADR-0011).
 *
 * Authority: ADR-0006 (evidence model), ADR-0011 (evidence-daemon),
 * ADR-0015 (evidence crypto → SDK), ADR-0017 (evidence data format),
 * SPEC §Crypto, EVIDENCE-FORMAT.md.
 */
export * from "./crypto.js";
export * from "./keys.js";
export * from "./ecies.js";
export * from "./manifest.js";
export * from "./options.js";
export * from "./parse.js";
export * from "./publish.js";
export * from "./fetch.js";
