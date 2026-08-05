// assertions.ts — jest assertion + account-read helpers shared across specs.

import type { Address, Decoder } from "@solana/kit";
import type { TestEnv } from "./env.js";

/**
 * Fetch + assert an account exists, is owned by the Accord program, and carries
 * data — the PDA-creation proof shared by every init-path spec.
 */
export async function expectAccordAccount(
  env: TestEnv,
  pda: Address,
): Promise<void> {
  const account = await env.rpc.getAccountInfo(pda, { encoding: "base64" }).send();
  expect(account.value).not.toBeNull();
  expect(account.value!.owner).toBe(env.programId);
  expect(account.value!.data.length).toBeGreaterThan(0);
}

/**
 * Fetch an account's raw bytes and decode with a generated codec — the working
 * read path (the facade's `fetchX` need a `ClientWithRpc` and break over a raw
 * `createSolanaRpc`). Returns `null` if the account doesn't exist. Use with the
 * SDK's generated decoders, e.g. `fetchDecoded(env, pda, getDisputeDecoder())`.
 */
export async function fetchDecoded<T>(
  env: TestEnv,
  pda: Address,
  decoder: Decoder<T>,
): Promise<T | null> {
  const account = await env.rpc.getAccountInfo(pda, { encoding: "base64" }).send();
  if (!account.value) return null;
  const bytes = new Uint8Array(Buffer.from(account.value.data[0], "base64"));
  return decoder.decode(bytes);
}
