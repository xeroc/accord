/**
 * client.test.ts — unit tests for the jurat chain client (bean accord-lii9):
 * operator keypair loading (every failure mode) and the mocked-rpc paths
 * (clock poll). sendIx needs a live validator — exercised by the Surfpool e2e
 * spec in the duty-pipeline epic, per cranker's send-test precedent.
 */
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createKeyPairSignerFromBytes,
  generateKeyPair,
  writeKeyPair,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";

import { loadConfig, type Config } from "../config.js";
import { createChainClient, loadOperatorSigner } from "./client.js";

let dir: string;
let keypairPath: string;
/** A real, valid solana keypair JSON (seed‖pub, written via kit's writeKeyPair). */
let keypairBytes: number[];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "jurat-client-"));
  keypairPath = join(dir, "operator.json");
  await writeKeyPair(await generateKeyPair(true), keypairPath);
  keypairBytes = JSON.parse(readFileSync(keypairPath, "utf-8"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function testConfig(): Config {
  return loadConfig({
    JURAT_RPC_URL: "http://127.0.0.1:8899",
    JURAT_KEYPAIR_PATH: keypairPath,
    JURAT_LLM_BASE_URL: "http://llm.internal/v1",
    JURAT_LLM_API_KEY: "sk-test",
    JURAT_LLM_MODEL: "test-model",
    JURAT_STAKING_TOKENS: "MintA",
    JURAT_FEE_TOKENS: "MintA",
    JURAT_STAKE_BUDGET: "1000",
    JURAT_SUBACCORD_CAP: "500",
    JURAT_RESERVE_FLOOR: "100",
  });
}

test("loadOperatorSigner reads a valid keypair file into a signer", async () => {
  const signer = await loadOperatorSigner(keypairPath);
  const expected = await createKeyPairSignerFromBytes(new Uint8Array(keypairBytes));
  expect(signer.address).toBe(expected.address);
});

test("loadOperatorSigner throws on unreadable file, bad JSON, wrong shape", async () => {
  await expect(loadOperatorSigner(join("/nonexistent-jurat", "nope.json"))).rejects.toThrow(
    /Cannot read operator keypair/,
  );

  const badJson = join(dir, "bad.json");
  writeFileSync(badJson, "{not json");
  await expect(loadOperatorSigner(badJson)).rejects.toThrow(/not valid JSON/);

  for (const [name, content] of [
    ["short array", JSON.stringify(keypairBytes.slice(0, 32))],
    ["non-integer entries", JSON.stringify([...keypairBytes.slice(0, 63), 1.5])],
    ["out-of-range entries", JSON.stringify([...keypairBytes.slice(0, 63), 256])],
    ["not an array", JSON.stringify({ a: 1 })],
  ] as const) {
    const path = join(dir, `${name.replace(/\W+/g, "-")}.json`);
    writeFileSync(path, content);
    await expect(loadOperatorSigner(path)).rejects.toThrow(/exactly 64 uint8 bytes/);
  }
});

/**
 * Stub rpc answering only getAccountInfo for the Clock sysvar — a base64
 * account whose bytes decode to slot u64@0 / unix_timestamp i64@32.
 */
function clockRpc(slot: bigint, unixTimestamp: bigint): Rpc<SolanaRpcApi> {
  const bytes = Buffer.alloc(4096);
  bytes.writeBigUInt64LE(slot, 0);
  bytes.writeBigInt64LE(unixTimestamp, 32);
  const data = [bytes.toString("base64"), "base64"] as const;
  return {
    getAccountInfo: () => ({ send: async () => ({ value: { data } }) }),
  } as unknown as Rpc<SolanaRpcApi>;
}

test("createChainClient wires signer + facade and polls the clock via rpc", async () => {
  const client = await createChainClient(testConfig(), {
    rpc: clockRpc(123_456n, 1_763_000_000n),
  });
  const expected = await createKeyPairSignerFromBytes(new Uint8Array(keypairBytes));
  expect(client.address).toBe(expected.address);
  expect(client.accord).toBeInstanceOf(Object);
  expect(await client.readClock()).toEqual({ slot: 123_456n, unixTimestamp: 1_763_000_000n });
});
