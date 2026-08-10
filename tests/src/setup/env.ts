// env.ts — the single place jest specs reach Surfpool + the @useaccord/sdk facade.
//
// Every spec calls `createTestEnv()` in `beforeAll` and gates on `env.up`
// (offline CI lane). When the validator is reachable, `sendIx` builds, signs,
// and confirms a v0 transaction against it through the SDK's adapter. No other
// file in `tests/src` should duplicate RPC/payer/send wiring — import it here.
// See AGENTS.md "e2e suite — tests/src".

import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

import { ACCORD_PROGRAM_ID, Accord } from "@useaccord/sdk";
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type SolanaRpcApi,
} from "@solana/kit";

/** The published contract every spec consumes. `sendAndConfirm`/`subs` stay
 * module-private (closure-captured by `sendIx`) so the surface stays minimal. */
export interface TestEnv {
  /** `false` ⇒ no validator reachable; specs skip (offline CI lane). */
  readonly up: boolean;
  /** JSON-RPC URL — `setup/cheats.ts` POSTs `surfnet_*` cheatcodes here. */
  readonly rpcUrl: string;
  readonly rpc: Rpc<SolanaRpcApi>;
  readonly payer: KeyPairSigner;
  readonly accord: Accord;
  readonly programId: Address;
  /** Build → sign → confirm a single instruction; returns the tx signature. */
  sendIx(instruction: Instruction): Promise<string>;
}

export interface TestEnvOptions {
  endpoint?: string;
  wsEndpoint?: string;
  payerPath?: string;
}

const DEFAULT_RPC = process.env.ACCORD_RPC_URL ?? "http://127.0.0.1:8899";
const DEFAULT_WS = process.env.ACCORD_WS_URL ?? "ws://127.0.0.1:8900";
const DEFAULT_PAYER =
  process.env.ACCORD_PAYER_PATH ?? `${homedir()}/.config/solana/id.json`;

const MIN_PAYER_LAMPORTS = lamports(BigInt(0.1e9));
const TOPUP_LAMPORTS = lamports(BigInt(2e9));

function loadPayerBytes(path: string): Uint8Array {
  return new Uint8Array(JSON.parse(readFileSync(path, "utf-8")));
}

/** Cheap RPC probe. Never throws — resolves `false` so specs can skip cleanly. */
async function isValidatorUp(rpc: Rpc<SolanaRpcApi>): Promise<boolean> {
  try {
    await rpc.getEpochInfo().send();
    return true;
  } catch {
    return false;
  }
}

/**
 * Spin up the shared harness. Probes the validator, funds the payer, and wires
 * the SDK facade + `sendIx`. Throws loudly (not skip) if a validator is up but
 * the Accord program isn't deployed — that's a misconfiguration of
 * `make run_surfpool`, not an offline-lane run.
 */
export async function createTestEnv(
  opts: TestEnvOptions = {},
): Promise<TestEnv> {
  const endpoint = opts.endpoint ?? DEFAULT_RPC;
  const wsEndpoint = opts.wsEndpoint ?? DEFAULT_WS;
  const payerPath = opts.payerPath ?? DEFAULT_PAYER;

  const rpc = createSolanaRpc(endpoint);

  let payer: KeyPairSigner;
  try {
    payer = await createKeyPairSignerFromBytes(loadPayerBytes(payerPath));
  } catch (e) {
    throw new Error(
      `TestEnv: cannot load payer keypair at ${payerPath} ` +
        `(set ACCORD_PAYER_PATH or run \`solana-keygen new -o ${DEFAULT_PAYER}\`): ${String(e)}`,
    );
  }

  const up = await isValidatorUp(rpc);

  // Always wire the pipeline — it's lazy; nothing connects until `sendIx`.
  const subs = createSolanaRpcSubscriptions(wsEndpoint);
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions: subs,
  });
  const accord = new Accord({ endpoint, signer: payer });

  const sendIx = async (instruction: Instruction): Promise<string> => {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(payer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    try {
      await sendAndConfirm(signed, { commitment: "confirmed" });
    } catch (e: unknown) {
      // Surface the program logs so failures aren't opaque "Custom program
      // error: #NNNN" — walk the error chain to find logs from the RPC layer.
      const logs = extractLogs(e);
      if (logs?.length) {
        console.error(
          `[sendIx] Transaction failed. Program logs:\n  ${logs.join("\n  ")}`,
        );
      }
      throw e;
    }
    return getSignatureFromTransaction(signed);
  };

  if (up) {
    const programAccount = await rpc.getAccountInfo(ACCORD_PROGRAM_ID).send();
    if (programAccount.value === null) {
      throw new Error(
        `TestEnv: Accord program not deployed at ${ACCORD_PROGRAM_ID}. ` +
          "Start Surfpool with `make run_surfpool` — it auto-deploys accord.so " +
          "via the committed runbook (cheatcode).",
      );
    }

    const balance = await rpc.getBalance(payer.address).send();
    if (balance.value < MIN_PAYER_LAMPORTS) {
      await rpc.requestAirdrop(payer.address, TOPUP_LAMPORTS).send();
      await sleep(500);
    }
  }

  return { up, rpcUrl: endpoint, rpc, payer, accord, programId: ACCORD_PROGRAM_ID, sendIx };
}

/**
 * Generate a fresh keypair and airdrop it SOL. Use for jurors/appellants — the
 * on-chain `stake` makes the JUROR the rent payer for JurorStake + the vault
 * ATA (`init_if_needed, payer = juror`, lib.rs:1728-1752), so any address that
 * stakes must hold SOL. Commit/reveal/finalize don't init, so those signers
 * need no SOL (the fee payer covers the tx).
 */
export async function fundSigner(
  env: TestEnv,
  amount = 500_000_000n, // ~0.5 SOL — covers JurorStake + vault-ATA rent
): Promise<KeyPairSigner> {
  const signer = await generateKeyPairSigner();
  await env.rpc.requestAirdrop(signer.address, lamports(amount)).send();
  await sleep(400);
  return signer;
}

/**
 * Walk an error's cause chain to extract transaction simulation logs.
 * Solana Kit wraps RPC errors in nested `cause` layers — this tries
 * `transactionLogs` then `logs` at each level. Uses `in` narrowing
 * (no unchecked casts).
 */
function extractLogs(e: unknown): string[] | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth++) {
    if (typeof cur !== "object") break;
    if ("transactionLogs" in cur) {
      const candidate = cur.transactionLogs;
      if (Array.isArray(candidate)) {
        return candidate.filter((v): v is string => typeof v === "string");
      }
    }
    if ("logs" in cur) {
      const candidate = cur.logs;
      if (Array.isArray(candidate)) {
        return candidate.filter((v): v is string => typeof v === "string");
      }
    }
    cur = "cause" in cur ? cur.cause : null;
  }
  return undefined;
}
