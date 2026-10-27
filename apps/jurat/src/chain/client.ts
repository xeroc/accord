/**
 * @useaccord/jurat — chain client (bean accord-lii9).
 *
 * One object bundling everything the daemon talks to Solana through: the JSON
 * RPC client, the WS subscriptions (send-confirmation + later program-log
 * hints), the operator keypair signer, the Accord SDK facade, a send path with
 * confirmation, and a poll clock read for window gating. Voting through this
 * client is gated by config.dryRun upstream — the client itself always sends.
 */
import { ed25519 } from "@noble/curves/ed25519";
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
 * Parse a solana keypair JSON file into its 64 bytes — no validation beyond
 * JSON shape; callers that need the signer use {@link loadOperatorSigner}.
 * Shared with the Ed25519 signMessage seam (evidence registration): one
 * parse, no drift.
 */
export function loadOperatorKeyBytes(path: string): Uint8Array {
  return new Uint8Array(JSON.parse(readFileSync(path, "utf-8")) as number[]);
}

/**
 * The 32-byte Ed25519 seed of a solana keypair file. Noble's `ed25519.sign`
 * takes the SEED — the file is 64 bytes (`seed ‖ public`), so sign with the
 * first half. Throws loudly on any other length (a wrong-size key must fail
 * boot, not produce signatures against the wrong identity). Shared by the
 * evidence-registration seam and the ADR-0037 trace sink.
 */
export function hotKeySeed(keypairBytes: Uint8Array): Uint8Array {
  if (keypairBytes.length !== 64) {
    throw new Error(`operator keypair must be 64 bytes (seed‖pub), got ${keypairBytes.length}`);
  }
  return keypairBytes.slice(0, 32);
}

/**
 * The evidence-registration `signMessage` seam over the operator keypair
 * (ADR-0034): the daemon verifies the signature against the operator's
 * Ed25519 PUBLIC key.
 */
export function operatorSignMessage(
  keypairBytes: Uint8Array,
): (message: Uint8Array) => Promise<Uint8Array> {
  const seed = hotKeySeed(keypairBytes);
  return (message) => Promise.resolve(ed25519.sign(message, seed));
}

/**
 * Load the operator keypair as a signer. Throws on unreadable file, malformed
 * JSON, or wrong shape — the identity is load-bearing, so boot fails loud.
 * Balance checks are not done here: funds are topped up manually and the
 * reserve floor lives in the join evaluator.
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
