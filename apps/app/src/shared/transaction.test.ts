/**
 * transaction.test.ts — pins the send contract of {@link sendInstruction}:
 * simulate → **broadcast** (`sendTransaction`) → confirm.
 *
 * Regression guard: the helper once simulated, built the sender, and returned
 * the signature without ever calling it — every write in the dApp silently
 * no-oped past simulation.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateKeyPairSigner,
  type Address,
  type Instruction,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

import { sendInstruction } from "./transaction";

/** Async iterable that never yields — a subscription with no notifications. */
function pendingNotifications(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise<never>(() => {}),
    }),
  };
}

test("sendInstruction broadcasts via sendTransaction after a clean simulation", async () => {
  const signer = await generateKeyPairSigner();
  const calls: string[] = [];
  const signature = "sig".repeat(20); // plausible base58-ish dummy

  const rpc = {
    getLatestBlockhash: () => ({
      send: async () => ({
        value: { blockhash: "1".repeat(32), lastValidBlockHeight: 1000n },
      }),
    }),
    simulateTransaction: (...args: unknown[]) => {
      calls.push("simulate");
      return { send: async () => ({ value: { err: null, logs: [] } }) };
    },
    sendTransaction: (...args: unknown[]) => {
      calls.push("send");
      return { send: async () => signature };
    },
    getSignatureStatuses: ([sig]: [string]) => ({
      send: async () => ({
        value: [{ slot: 1, err: null, confirmationStatus: "confirmed" }],
      }),
    }),
    getEpochInfo: () => ({
      send: async () => ({ absoluteSlot: 1n, blockHeight: 1n }),
    }),
  } as unknown as Rpc<SolanaRpcApi>;

  const rpcSubscriptions = {
    signatureNotifications: () => ({
      subscribe: async () => pendingNotifications(),
    }),
    slotNotifications: () => ({
      subscribe: async () => pendingNotifications(),
    }),
  } as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;

  const instruction = {
    programAddress: "1".repeat(32) as Address,
    accounts: [],
    data: new Uint8Array(),
  } as Instruction;

  const returned = await sendInstruction(
    rpc,
    rpcSubscriptions,
    signer,
    instruction,
  );

  assert.deepEqual(calls, ["simulate", "send"]);
  assert.ok(returned, "returns the transaction signature");
});

test("sendInstruction throws TransactionSendError and never broadcasts on a failed simulation", async () => {
  const signer = await generateKeyPairSigner();
  const calls: string[] = [];

  const rpc = {
    getLatestBlockhash: () => ({
      send: async () => ({
        value: { blockhash: "1".repeat(32), lastValidBlockHeight: 1000n },
      }),
    }),
    simulateTransaction: () => {
      calls.push("simulate");
      return {
        send: async () => ({
          value: { err: "InstructionFallbackNotFound", logs: ["Program log: boom"] },
        }),
      };
    },
    sendTransaction: () => {
      calls.push("send");
      return { send: async () => "sig" };
    },
  } as unknown as Rpc<SolanaRpcApi>;

  const rpcSubscriptions = {} as unknown as RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  const instruction = {
    programAddress: "1".repeat(32) as Address,
    accounts: [],
    data: new Uint8Array(),
  } as Instruction;

  await assert.rejects(
    sendInstruction(rpc, rpcSubscriptions, signer, instruction),
    /simulation failed/,
  );
  assert.deepEqual(calls, ["simulate"]);
});
