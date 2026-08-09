/**
 * sendIx — build, sign, and confirm a single instruction as a v0 transaction
 * with priority-fee escalation on transient send failures.
 *
 * Failure model (milestone accord-27r5 §3 "Retry logic"):
 *   - Simulation / on-chain error (program logs present) → {@link SimulationError},
 *     SKIP. Another cranker or the user already advanced the state; retrying
 *     only burns fees.
 *   - Transient send/confirm failure (no logs)              → RETRY with a higher
 *     priority fee, up to `maxRetries`, then {@link SendError}.
 *
 * One instruction per tx — no bundling (milestone accord-27r5 §3 "No bundling").
 */
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageComputeUnitPrice,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Commitment,
  type Instruction,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionSigner,
} from "@solana/kit";

/** Non-retryable: the ix failed simulation or landed but errored on-chain. */
export class SimulationError extends Error {
  readonly logs: readonly string[];
  constructor(message: string, logs: readonly string[]) {
    super(message);
    this.name = "SimulationError";
    this.logs = logs;
  }
}

/** Retryable send/confirm attempts exhausted. */
export class SendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SendError";
  }
}

export interface SendConfig {
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  feePayer: TransactionSigner;
  /** Starting priority fee in micro-lamports per CU. Default 10_000 (0.01 lamport/CU). */
  basePriorityFeeMicroLamports?: bigint;
  /** Multiplier applied to the fee on each retry. Default 2. */
  priorityFeeEscalationFactor?: number;
  /** Max send attempts including the first. Default 3. */
  maxRetries?: number;
  commitment?: Commitment;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Send one instruction. Returns the tx signature on confirmation.
 * Throws {@link SimulationError} for on-chain/sim failures (caller skips),
 * {@link SendError} after exhausting retries on transient failures.
 */
export async function sendIx(instruction: Instruction, config: SendConfig): Promise<string> {
  const {
    rpc,
    rpcSubscriptions,
    feePayer,
    basePriorityFeeMicroLamports = 10_000n,
    priorityFeeEscalationFactor = 2,
    maxRetries = 3,
    commitment = "confirmed",
    log = defaultLog,
  } = config;

  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment }).send();

  let fee = basePriorityFeeMicroLamports;
  let attempt = 0;
  // ponytail: refresh-on-retry (re-fetch blockhash when a retry fires) is the
  // upgrade path if stale-blockhash retries appear; a 60s-poll cranker sending
  // one ix at a time rarely outlives one blockhash window.
  for (;;) {
    attempt++;
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => setTransactionMessageComputeUnitPrice(fee, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);

    try {
      await sendAndConfirm(signed, { commitment });
      const signature = getSignatureFromTransaction(signed);
      log("crank tx confirmed", {
        signature,
        attempt,
        priorityFeeMicroLamports: fee.toString(),
      });
      return signature;
    } catch (e: unknown) {
      const logs = extractLogs(e);
      if (logs !== undefined) {
        // Simulation or on-chain error — state moved; skip (do not retry).
        throw new SimulationError(
          `crank tx failed on-chain (attempt ${attempt}): ${errorDigest(e)}`,
          logs,
        );
      }
      if (attempt >= maxRetries) {
        throw new SendError(`crank tx send failed after ${attempt} attempt(s): ${errorDigest(e)}`, {
          cause: e,
        });
      }
      fee = fee * BigInt(priorityFeeEscalationFactor);
      log("crank tx send failed; retrying with higher fee", {
        attempt,
        nextPriorityFeeMicroLamports: fee.toString(),
        error: errorDigest(e),
      });
    }
  }
}

/** Structured JSON line on stdout — matches the daemon logging convention. */
function defaultLog(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ msg, ...fields }));
}

/**
 * Walk an error's cause chain for transaction simulation logs. Kit wraps RPC
 * errors in nested `cause` layers; presence of logs means the tx was simulated
 * (and failed) — the signal that the on-chain state no longer matches the ix.
 * Returns `undefined` when no logs are found (transient send/confirm failure).
 */
function extractLogs(e: unknown): string[] | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth++) {
    if (typeof cur !== "object") break;
    if ("transactionLogs" in cur) {
      const candidate = cur.transactionLogs;
      if (Array.isArray(candidate)) {
        const logs = candidate.filter((v): v is string => typeof v === "string");
        if (logs.length > 0) return logs;
      }
    }
    if ("logs" in cur) {
      const candidate = cur.logs;
      if (Array.isArray(candidate)) {
        const logs = candidate.filter((v): v is string => typeof v === "string");
        if (logs.length > 0) return logs;
      }
    }
    cur = "cause" in cur ? cur.cause : null;
  }
  return undefined;
}

/** Compact, leak-free digest of an unknown error for log lines. */
function errorDigest(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}
