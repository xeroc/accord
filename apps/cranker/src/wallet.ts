/**
 * Cranker wallet — loads the protocol-subsidized fee-payer keypair from
 * `ACCORD_CRANKER_KEYPAIR` (path to a solana keypair JSON file) and verifies it
 * is funded above the minimum floor. The cranker pays for every crank tx, so an
 * unfunded keypair fails loud at boot rather than stalling mid-loop
 * (milestone accord-27r5).
 */
import { readFileSync } from "node:fs";

import {
  createKeyPairSignerFromBytes,
  lamports,
  type Address,
  type KeyPairSigner,
  type Lamports,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";

/** Minimum balance to consider the cranker "funded" (0.1 SOL). */
export const MIN_CRANKER_FUND_LAMPORTS: Lamports = lamports(BigInt(0.1e9));

export interface CrankerWallet {
  /** Fee payer + signing account for every crank tx. */
  readonly signer: KeyPairSigner;
  readonly address: Address;
  /** Live balance at load time (boot-time fund check). */
  readonly balanceLamports: Lamports;
}

/**
 * Read + validate the cranker keypair, then probe its balance. Throws on any
 * missing env var, unreadable/malformed keypair file, or underfunded account.
 * `env` defaults to `process.env` so tests can inject a deterministic env.
 */
export async function loadCrankerWallet(
  env: Record<string, string | undefined> = process.env,
  rpc: Rpc<SolanaRpcApi>,
): Promise<CrankerWallet> {
  const path = env.ACCORD_CRANKER_KEYPAIR;
  if (path === undefined || path.trim().length === 0) {
    throw new Error(
      "Missing required env var: ACCORD_CRANKER_KEYPAIR (path to a solana keypair JSON file)",
    );
  }

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(
      `Cannot read cranker keypair at "${path}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Cranker keypair "${path}" is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (
    !Array.isArray(bytes) ||
    bytes.length !== 64 ||
    !bytes.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    throw new Error(
      `Cranker keypair "${path}" must be a JSON array of exactly 64 uint8 bytes (got ${
        Array.isArray(bytes) ? bytes.length : typeof bytes
      }).`,
    );
  }

  const signer = await createKeyPairSignerFromBytes(new Uint8Array(bytes as number[]));
  const balance = await rpc.getBalance(signer.address).send();
  if (balance.value < MIN_CRANKER_FUND_LAMPORTS) {
    throw new Error(
      `Cranker keypair ${signer.address} is underfunded: ${balance.value} lamports < ${MIN_CRANKER_FUND_LAMPORTS} floor. ` +
        "Fund it — the cranker is protocol-subsidized (milestone accord-27r5).",
    );
  }

  return { signer, address: signer.address, balanceLamports: balance.value };
}
