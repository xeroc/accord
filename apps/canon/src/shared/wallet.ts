/**
 * Signer seam — the source of the connected wallet `TransactionSigner`.
 *
 * Backed by ConnectorKit's `useKitTransactionSigner()`. Every write surface
 * (request_withdrawal) consumes `{ signer }` from here. Mirrors apps/app.
 */
import { useKitTransactionSigner } from "@solana/connector";
import type { Address, TransactionSigner } from "@solana/kit";

/** `Pubkey::default()` — the on-chain sentinel for "no challenger/dispute". */
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
