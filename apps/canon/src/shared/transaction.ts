/**
 * transaction.ts — shared instruction-sending helper.
 *
 * Builds a v0 transaction message from a single instruction, signs it with
 * the provided signer (fee payer), simulates it (pre-flight — program reverts
 * surface as {@link TransactionSendError} with logs), then confirms via
 * subscription. Mirrors apps/app/src/shared/transaction.ts.
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

/**
 * Thrown when pre-flight transaction simulation fails — i.e. the program
 * reverted during simulation. Carries the program logs so the UI can show why.
 */
export class TransactionSendError extends Error {
  readonly logs: readonly string[];
  readonly simulationError: unknown;
  constructor(message: string, logs: readonly string[], simulationError: unknown) {
    super(message);
    this.name = "TransactionSendError";
    this.logs = logs;
    this.simulationError = simulationError;
  }
}

/**
 * Send a single instruction, signed by `signer` (fee payer), and wait for
 * confirmation. Simulates first so a program revert fails fast with its logs.
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
  const signed = await signTransactionMessageWithSigners(message);
  assertIsTransactionWithBlockhashLifetime(signed);

  // Pre-flight: simulate the signed, wire-encoded transaction so a program
  // revert fails fast with its logs — before we pay for broadcast.
  const { value: simulation } = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
    })
    .send();
  if (simulation.err !== null) {
    const logs = simulation.logs ?? [];
    const reason = String(simulation.err);
    const detail =
      logs.length > 0
        ? `Transaction simulation failed: ${reason}\n${logs.map((l) => `  ${l}`).join("\n")}`
        : `Transaction simulation failed: ${reason}`;
    throw new TransactionSendError(detail, logs, simulation.err);
  }

  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });
  await sendAndConfirm(signed, { commitment: "confirmed" });
  return getSignatureFromTransaction(signed);
}
