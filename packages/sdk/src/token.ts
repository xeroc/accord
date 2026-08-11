/**
 * SPL Token + Associated Token Account (ATA) derivation.
 *
 * Single source of truth for the canonical ATA address used across fee and
 * collateral flows (ADR-0020). `@solana/kit` v7 does not export the SPL
 * program ids, so they live here. Hand-rolled (no `@solana/spl-token`
 * dependency) to keep the jest e2e suite free of the web3.js v1 `uuid` break —
 * matches the on-chain `create_associated_token_account` layout:
 * `ATA_PROGRAM ‖ [owner, TOKEN_PROGRAM, mint]`.
 *
 * @see ADR-0020
 */
import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";

/** SPL Token program id (not exported by @solana/kit v7). */
export const TOKEN_PROGRAM_ADDRESS =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/** SPL Associated Token Account program id (not exported by @solana/kit v7). */
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/**
 * Derive the canonical Associated Token Account (ATA) address for `mint`
 * owned by `owner`. Argument order follows `@solana/spl-token`'s
 * `getAssociatedTokenAddress(mint, owner, …)`.
 */
export async function findAssociatedTokenAddress(
  mint: Address,
  owner: Address,
): Promise<Address> {
  const enc = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [enc.encode(owner), enc.encode(TOKEN_PROGRAM_ADDRESS), enc.encode(mint)],
  });
  return ata;
}
