/**
 * @veridao/sdk — entrypoint.
 *
 * Barrel exports are filled in as the programs gain instructions. Each program
 * module re-exports its IDL type, program client, and PDA helpers:
 *   - `methods/dispute` → Arbitrable CPI API (create_dispute / get_ruling)
 *   - `pda.ts`          → canonical PDA derivations
 *
 * Conventions (see AGENTS.md § Code Style):
 *   - `Address` for all addresses; `bigint` for all on-chain numbers.
 *   - camelCase identifiers; snake_case only where matching on-chain field names.
 */

export const SDK_NAME = "@veridao/sdk";
export const SDK_VERSION = "0.1.0";

// Arbitrable CPI API — the primary external surface (ADR-0010, bean veridao-50qy).
export * from "./methods/dispute.js";

// Commit-reveal voting + finalization cranks + the commit-hash helper
// (ADR-0010, bean veridao-a0mc).
export * from "./methods/voting.js";

// Snapshot trust (post/challenge/finalize) + Merkle-Sum Tree membership builder
// for ADR-0009 sortition (ADR-0010, bean veridao-dsc2).
export * from "./methods/snapshot.js";

// Subaccord lifecycle + circuit breaker (ADR-0005/0007) + timelock helpers
// (ADR-0010, bean veridao-erv7).
export * from "./methods/lifecycle.js";

// VRF request + draw choreography + sortition slot derivation (ADR-0009 §2,
// ADR-0010, bean veridao-j7tx).
export * from "./methods/vrf.js";
