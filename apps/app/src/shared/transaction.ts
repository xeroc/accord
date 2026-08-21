/**
 * transaction.ts — shared instruction-sending helper.
 *
 * Builds a v0 transaction message from a single instruction, signs it with
 * the provided signer (fee payer), simulates it (pre-flight — program reverts
 * surface as {@link TransactionSendError} with logs), then confirms via
 * subscription.
+
 * This is the only send path in the dApp — feature code builds an
 * `Instruction` via the SDK facade and hands it here.
 *
 * ponytail: one instruction per message — every Accord happy path is a single
 * ix (create/stake/dispute/vote/appeal). Bundle when a multi-ix tx lands.
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

import { queryClient } from "./queryClient";
/**
 * Thrown when pre-flight transaction simulation fails — i.e. the program
 * reverted before we ever broadcast. Carries the full program `logs`; the
 * verbose `.message` keeps them for the console, while {@link describeError}
 * extracts a clean one-line reason (e.g. the Anchor error-code name) for toasts.
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
 * confirmation.
 *
 * Before broadcasting, the signed message is simulated against a fresh
 * blockhash — a program revert surfaces as a {@link TransactionSendError}
 * carrying the program logs, so the UI can show *why* the instruction failed
 * instead of a generic send failure.
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
  // revert fails fast with its logs — before we pay for broadcast. One wallet
  // interaction: the sign above is reused for the real send below.
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
  // A confirmed tx changed on-chain state — drop every cached read so the
  // next render reflects it (apple-design audit C1: txs completed silently).
  // Domain-doc bytes are content-addressed and immutable — skip the refetch.
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== "domain-doc",
  });
   return getSignatureFromTransaction(signed);
}
