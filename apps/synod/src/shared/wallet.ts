/**
 * Signer seam — the source of the connected wallet `TransactionSigner`.
 *
 * Backed by ConnectorKit's `useKitTransactionSigner()`, which adapts the
 * connected wallet into a kit-compatible signer. Every write surface (open
 * case, join, claim) consumes `{ signer }` from here — connect in the navbar
 * and they all light up.
 *
 * Mirrors apps/canon/src/shared/wallet.ts.
 */
import { useKitTransactionSigner } from "@solana/connector";
import type { Address, TransactionSigner } from "@solana/kit";

/** `Pubkey::default()` — the on-chain sentinel (no authority / no operator). */
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
