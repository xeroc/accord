/**
 * Wallet + endpoint helpers for the Accord CLI.
 *
 * The signer is loaded from a Solana keypair JSON file (a plain array of 64
 * uint8 bytes). The path comes from `--wallet` (default: `$ANCHOR_WALLET`),
 * matching the Anchor wallet convention.
 */
import { readFileSync } from "node:fs";

import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";

/**
 * Read a 64-byte Solana keypair from a JSON file (Anchor/`solana-keygen`
 * format: `[n0, n1, ..., n63]`) and wrap it as a Kit `KeyPairSigner`.
 *
 * The resulting signer is a full `TransactionSigner` — usable as fee payer,
 * instruction authority, and signing account.
 */
export async function loadKeypair(path: string): Promise<KeyPairSigner> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (e) {
    throw new Error(
      `Cannot read wallet keypair at "${path}" ` +
        `(set --wallet or $ANCHOR_WALLET): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  let bytes: unknown;
  try {
    bytes = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Wallet file "${path}" is not valid JSON (expected a uint8 array): ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (
    !Array.isArray(bytes) ||
    bytes.length !== 64 ||
    !bytes.every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    throw new Error(
      `Wallet file "${path}" must be a JSON array of exactly 64 uint8 bytes (got ${
        Array.isArray(bytes) ? bytes.length : typeof bytes
      }).`,
    );
  }

  return createKeyPairSignerFromBytes(new Uint8Array(bytes as number[]));
}

/**
 * Derive a sensible WebSocket endpoint from an RPC URL. Local/dev validators
 * conventionally mirror `http(s)://host:8899` with `ws(s)://host:8900`; for a
 * remote RPC that already advertises a ws port, only the scheme is swapped.
 * Override with `--ws` / `$ACCORD_WS_URL` when the heuristic is wrong.
 */
export function defaultWsEndpoint(rpc: string): string {
  let ws = rpc.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
  // Local/test-validator default port pair.
  ws = ws.replace(/:8899\b/, ":8900");
  return ws;
}
