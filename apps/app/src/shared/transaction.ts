/**
 * transaction.ts — shared instruction-sending helper.
 *
 * Builds a v0 transaction message from a single instruction, signs it with
 * the provided signer (fee payer), and confirms via subscription.
 *
 * This is the only send path in the dApp — feature code builds an
 * `Instruction` via the SDK facade and hands it here.
 *
 * ponytail: one instruction per message — every Accord happy path is a single
 * ix (create/stake/dispute/vote/appeal). Bundle when a multi-ix tx lands.
 */

import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  compileTransaction,
  createTransactionMessage,
  getSignatureFromTransaction,
  getTransactionEncoder,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";

/** Solana serialized transaction size limit (bytes). */
const MAX_TX_SIZE = 1232;

/**
 * Send a single instruction, signed by `signer` (fee payer), and wait for
 * confirmation.
 *
 * @returns the transaction signature (base58)
 */
export async function sendInstruction(
  rpc: Rpc<SolanaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  signer: TransactionSigner,
  instruction: Instruction,
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions([instruction], tx),
  );

  // Pre-flight: check serialized size before asking the wallet to sign.
  // A depth-N MST proof is N×40 bytes of instruction data; with accounts it
  // can exceed the 1232-byte limit. Catch it here with an actionable message.
  const compiled = compileTransaction(message);
  const txBytes = getTransactionEncoder().encode(compiled);
  if (txBytes.length > MAX_TX_SIZE) {
    throw new Error(
      `Transaction too large: ${txBytes.length} bytes (limit ${MAX_TX_SIZE}). ` +
        "The accumulator proof doesn't fit — use a lower tree depth when " +
        "creating the subaccord, or use Address Lookup Tables.",
    );
  }

  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });
  await sendAndConfirm(signed, { commitment: "confirmed" });
  return getSignatureFromTransaction(signed);
}
