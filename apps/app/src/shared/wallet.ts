/**
 * Signer seam — the source of the connected wallet `TransactionSigner`.
 *
 * Today this returns `null`: ConnectorKit (`@solana/connector`) and its
 * `useKitTransactionSigner()` provider land with accord-y5av (wallet + navbar
 * + cluster selector). When that bean ships, replace this stub with the real
 * hook — every write surface (create subaccord, stake, dispute, vote, appeal)
 * already consumes `{ signer }` from here, so the swap lights them all up.
 *
 * ponytail: one seam, not a per-feature stub — every write view gates on it.
 */
import type { Address, TransactionSigner } from "@solana/kit";

/** `Pubkey::default()` — the on-chain sentinel for "no authority"
 * (immutable Subaccord) and "no evidence operator". All-zero public key. */
export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

export interface SignerState {
  /** The connected wallet, or `null` until ConnectorKit wires the provider. */
  signer: TransactionSigner | null;
  /** `false` until a real provider resolves the wallet. */
  ready: boolean;
}

// ponytail: stub — accord-y5av replaces the body with useKitTransactionSigner().
export function useSigner(): SignerState {
  return { signer: null, ready: true };
}
