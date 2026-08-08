/**
 * tokens.ts — Associated Token Account (ATA) address derivation.
 *
 * Uses `findAssociatedTokenPda` from `@solana-program/token` (Kit-native,
 * no web3.js v1) to derive the canonical ATA for an owner + mint pair.
 */

import { findAssociatedTokenPda } from "@solana-program/token";
import type { Address } from "@solana/kit";

/** The SPL Token program address (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA). */
export const TOKEN_PROGRAM_ADDRESS: Address<Address> =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address<Address>;

/** The Token-2022 program address. */
export const TOKEN_2022_PROGRAM_ADDRESS: Address<Address> =
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" as Address<Address>;

/**
 * Derive the Associated Token Account address for an owner + mint.
 *
 * @param owner - the wallet address that owns the ATA
 * @param mint - the SPL token mint address
 * @param tokenProgram - TOKEN_PROGRAM_ADDRESS (default) or TOKEN_2022_PROGRAM_ADDRESS
 * @returns the derived ATA address as a base58 string
 */
export async function getAtaAddress(
  owner: Address,
  mint: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<Address> {
  const [ataPda] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  return ataPda;
}
