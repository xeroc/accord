/**
 * Wallet adapter: Keypair bytes | IWallet → Kit TransactionSigner.
 *
 * Kit's `KeyPairSigner` already implements `TransactionSigner`, so the keypair
 * path is a direct factory. External wallets (browser extensions, hardware)
 * implement `IWallet`; `signerFromWallet` adapts them into a Kit
 * `TransactionPartialSigner` (which satisfies `TransactionSigner`).
 */

import {
  createKeyPairSignerFromBytes,
  type Address,
  type KeyPairSigner,
  type SignatureDictionary,
  type Transaction,
  type TransactionPartialSigner,
  type TransactionSigner,
} from "@solana/kit";

export type AccordSigner = TransactionSigner;

/**
 * Minimal external-wallet interface. Compatible with @solana/wallet-adapter
 * wallets that expose `signMessage`, or any custom signing provider.
 */
export interface IWallet {
  readonly publicKey: Address;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

/**
 * Create a Kit `KeyPairSigner` from raw 64-byte keypair bytes (e.g. a
 * Solana keypair JSON file). The resulting signer is a full `TransactionSigner`.
 */
export async function signerFromKeypairBytes(
  bytes: Uint8Array,
): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(bytes);
}

/**
 * Adapt an external `IWallet` into a Kit `TransactionPartialSigner` for use
 * with the Accord facade. Signs each transaction's compiled message bytes
 * via the wallet's `signMessage` and returns a per-transaction signature map.
 */
export function signerFromWallet(wallet: IWallet): TransactionPartialSigner {
  return Object.freeze({
    address: wallet.publicKey,
    async signTransactions(
      transactions: readonly Transaction[],
    ): Promise<SignatureDictionary[]> {
      return Promise.all(
        transactions.map(async (tx) => {
          const signature = await wallet.signMessage(
            new Uint8Array(tx.messageBytes),
          );
          return { [wallet.publicKey]: signature } as SignatureDictionary;
        }),
      );
    },
  });
}
