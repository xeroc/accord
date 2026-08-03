/**
 * @veridao/sdk — entrypoint.
 *
 * Barrel exports are filled in as the programs gain instructions. Each program
 * module re-exports its IDL type, program client, and PDA helpers:
 *   - `court/`    → Arbitrable CPI helpers (create_dispute / get_ruling)
 *   - `mutual/`   → factory + claim + settlement helpers
 *   - `pda.ts`    → canonical PDA derivations
 *
 * Conventions (see AGENTS.md § Code Style):
 *   - `PublicKey` for all addresses; `anchor.BN` for all numbers.
 *   - Prefer `accountsStrict()` over `accounts()` for type safety.
 *   - camelCase identifiers; snake_case only where matching on-chain field names.
 */

export const SDK_NAME = "@veridao/sdk";
export const SDK_VERSION = "0.1.0";
