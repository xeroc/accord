/**
 * @useaccord/jurat — chain client (bean accord-lii9).
 *
 * One object bundling everything the daemon talks to Solana through: the JSON
 * RPC client, the WS subscriptions (send-confirmation + later program-log
 * hints), the operator keypair signer, the Accord SDK facade, a send path with
 * confirmation, and a poll clock read for window gating. Voting through this
 * client is gated by config.dryRun upstream — the client itself always sends.
 */
import { readFileSync } from "node:fs";

import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";
import { Accord } from "@useaccord/sdk";

import type { Config } from "../config.js";

/** Solana Clock sysvar (`SysvarC1ock11111111111111111111111111111111`). */
const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;

/** slot u64@0, unix_timestamp i64@32 (same layout as tests/src/setup/cheats.ts). */
export interface ClockView {
  slot: bigint;
  unixTimestamp: bigint;
}

export interface ChainClient {
  readonly rpc: Rpc<SolanaRpcApi>;
  readonly rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  /** The single operator identity — fee payer and juror account. */
  readonly signer: KeyPairSigner;
  readonly address: Address;
  readonly accord: Accord;
  /**
   * Build, sign, send, and confirm one instruction as a v0 tx; returns the
   * signature. No retry ladder — the caller (duty pipeline) owns failure
   * policy. ponytail: priority-fee escalation à la cranker send.ts if vote txs
   * ever starve on fee markets.
   */
  sendIx(instruction: Instruction): Promise<string>;
  /** Poll the Clock sysvar — slot + unixTimestamp for commit/reveal gating. */
  readClock(): Promise<ClockView>;
}

/** Injection seam: tests pass stub rpc/subscriptions; defaults are real. */
export interface ChainClientDeps {
  rpc?: Rpc<SolanaRpcApi>;
  rpcSubscriptions?: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
}

export async function createChainClient(
  config: Config,
  deps: ChainClientDeps = {},
): Promise<ChainClient> {
  const signer = await loadOperatorSigner(config.keypairPath);
  const rpc = deps.rpc ?? createSolanaRpc(config.rpcUrl);
  const rpcSubscriptions = deps.rpcSubscriptions ?? createSolanaRpcSubscriptions(config.wsUrl);
  const accord = new Accord({ endpoint: config.rpcUrl, signer });
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  return {
    rpc,
    rpcSubscriptions,
    signer,
    address: signer.address,
    accord,
    async sendIx(instruction: Instruction): Promise<string> {
      const { value: latestBlockhash } = await rpc
        .getLatestBlockhash({ commitment: "confirmed" })
        .send();
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) => setTransactionMessageFeePayerSigner(signer, tx),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions([instruction], tx),
      );
      const signed = await signTransactionMessageWithSigners(message);
      assertIsTransactionWithBlockhashLifetime(signed);
      await sendAndConfirm(signed, { commitment: "confirmed" });
      return getSignatureFromTransaction(signed);
    },
    async readClock(): Promise<ClockView> {
      const { value } = await rpc.getAccountInfo(CLOCK_SYSVAR, { encoding: "base64" }).send();
      if (!value) {
        throw new Error("Clock sysvar not readable");
      }
      const bytes = Buffer.from(value.data[0], "base64");
      return { slot: bytes.readBigUInt64LE(0), unixTimestamp: bytes.readBigInt64LE(32) };
    },
  };
}

/**
 * Load the operator keypair from a solana keypair JSON file (64 uint8 array).
 * Throws on unreadable file, malformed JSON, or wrong shape — the identity is
 * load-bearing, so boot fails loud. Balance checks are not done here: funds are
 * topped up manually and the reserve floor lives in the join evaluator.
 */
export async function loadOperatorSigner(path: string): Promise<KeyPairSigner> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(
      `Cannot read operator keypair at "${path}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Operator keypair "${path}" is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (
    !Array.isArray(bytes) ||
    bytes.length !== 64 ||
    !bytes.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    throw new Error(
      `Operator keypair "${path}" must be a JSON array of exactly 64 uint8 bytes (got ${
        Array.isArray(bytes) ? bytes.length : typeof bytes
      }).`,
    );
  }

  return createKeyPairSignerFromBytes(new Uint8Array(bytes as number[]));
}
