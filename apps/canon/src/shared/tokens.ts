/**
 * tokens.ts — ATA derivation via Kit-native `findAssociatedTokenPda`.
 * Mirrors apps/app's shared/tokens.ts (no @solana/spl-token → web3.js v1).
 */
import { findAssociatedTokenPda } from "@solana-program/token";
import type { Address } from "@solana/kit";

/** The SPL Token program address. */
export const TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

/** Derive the canonical ATA for an owner + mint pair. */
export async function ataAddress(
  owner: Address,
  mint: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ID,
): Promise<Address> {
  const [pda] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  return pda;
}
