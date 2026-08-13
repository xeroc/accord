/**
 * Signer seam — the source of the connected wallet `TransactionSigner`.
 *
 * Backed by ConnectorKit's `useKitTransactionSigner()`, which adapts the
 * connected wallet into a kit-compatible signer. Every write surface
 * (create subaccord, stake, dispute, vote, appeal) consumes `{ signer }`
 * from here — connect in the navbar and they all light up.
 *
 * ponytail: one seam, not a per-feature stub — every write view gates on it.
 */
import { useKitTransactionSigner } from "@solana/connector";
import type { Address, TransactionSigner } from "@solana/kit";

/** `Pubkey::default()` — the on-chain sentinel for "no authority"
 * (immutable Subaccord) and "no evidence operator". All-zero public key. */
export const ZERO_ADDRESS = "11111111111111111111111111111111" as Address;

export interface SignerState {
  /** The connected wallet, or `null` when no wallet is connected. */
  signer: TransactionSigner | null;
  /** `true` once ConnectorKit has resolved (even before a wallet connects). */
  ready: boolean;
}

export function useSigner(): SignerState {
  return useKitTransactionSigner();
}
