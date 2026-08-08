/**
 * transaction.ts — shared instruction-sending helper.
 *
 * Builds a v0 transaction message from a single instruction, signs it with
 * the provided signer (fee payer), and confirms via subscription.
 *
 * This is the only send path in the dApp — feature code builds an
 * `Instruction` via the SDK facade and hands it here.
 */

import {
  appendTransactionMessageInstruction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
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

  const transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstruction(instruction, m),
  );

  const signedTransaction =
    await signTransactionMessageWithSigners(transactionMessage);
  assertIsTransactionWithBlockhashLifetime(signedTransaction);

  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });
  await sendAndConfirm(signedTransaction, { commitment: "confirmed" });

  return getSignatureFromTransaction(signedTransaction);
}
