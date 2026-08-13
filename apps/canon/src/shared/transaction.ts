/**
 * transaction.ts — shared instruction-sending helper.
 * Mirrors apps/app's shared/transaction.ts (single-ix v0 message + pre-flight).
 */
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
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

export class TransactionSendError extends Error {
  logs: string[];
  constructor(message: string, logs: string[] = []) {
    super(message);
    this.name = "TransactionSendError";
    this.logs = logs;
  }
}

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
  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);

  const { value: simulation } = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
    })
    .send();
  if (simulation.err !== null) {
    const logs = simulation.logs ?? [];
    throw new TransactionSendError(
      `Transaction simulation failed: ${String(simulation.err)}`,
      logs,
    );
  }

  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });
  await sendAndConfirm(signed, { commitment: "confirmed" });
  return getSignatureFromTransaction(signed);
}
