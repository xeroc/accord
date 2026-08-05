// onchain-smoke.spec.ts — real on-chain integration tests against a local
// test-validator with the Accord program loaded at its declared address.
//
// Proves the full pipeline: jest → @solana/kit → @veridao/sdk → validator →
// program → fetch → assert. Exercises `init` (PDA creation + owner check) and
// the fetch round-trip — the two paths that are impossible to test offline.
//
// Prerequisites: `make run_validator` (terminal 1), then `make test` (terminal 2).
// If no validator is reachable, these tests SKIP (not fail) — the offline
// pipeline smoke (sdk-pipeline.spec.ts) remains the CI gate.

import {
  ACCORD_PROGRAM_ID,
  Accord,
  createSubaccord,
  initializePause,
} from "@veridao/sdk";
import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  type Instruction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const RPC_URL = process.env.ACCORD_RPC_URL ?? "http://127.0.0.1:8899";
const WS_URL = process.env.ACCORD_WS_URL ?? "ws://127.0.0.1:8900";

function loadPayerKeypair(): Uint8Array {
  const path = `${homedir()}/.config/solana/id.json`;
  return new Uint8Array(JSON.parse(readFileSync(path, "utf-8")));
}

/** Random 32-byte buffer (unique riskType per run → unique PDA). */
function randomBytes32(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

describe("on-chain: program lifecycle (requires local validator)", () => {
  // Lazily created in beforeAll (skip subscription WS if no validator).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rpc: any, rpcSubscriptions: any, sendAndConfirm: any;
  let payer: Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>;
  let accord: Accord;
  let validatorUp = false;

  beforeAll(async () => {
    rpc = createSolanaRpc(RPC_URL);
    try {
      await rpc.getEpochInfo().send();
      validatorUp = true;
    } catch {
      validatorUp = false;
      return;
    }

    rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
    sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc,
      rpcSubscriptions,
    });
    payer = await createKeyPairSignerFromBytes(loadPayerKeypair());
    accord = new Accord({ endpoint: RPC_URL, signer: payer });

    // Ensure payer has SOL (test-validator faucet is instant)
    const bal = await rpc.getBalance(payer.address).send();
    if (bal.value < lamports(BigInt(0.1e9))) {
      await rpc.requestAirdrop(payer.address, lamports(BigInt(2e9))).send();
      await new Promise((r) => setTimeout(r, 500));
    }
  }, 60_000);

  /** Build → sign → send → confirm a single instruction. */
  async function sendIx(instruction: Instruction) {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(payer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx),
    );
    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    const signature = getSignatureFromTransaction(signed);
    await sendAndConfirm(signed, { commitment: "confirmed" });
    return signature;
  }

  it("initializePause: creates PauseState PDA on-chain (init + owner check)", async () => {
    if (!validatorUp) return;
    const { instruction, pauseState } = await initializePause(
      accord.adapter,
      ACCORD_PROGRAM_ID,
      payer.address,
    );
    await sendIx(instruction);

    // Verify the PDA was created: account exists, owned by the program, has data.
    const account = await rpc
      .getAccountInfo(pauseState, { encoding: "base64" })
      .send();
    expect(account.value).not.toBeNull();
    expect(account.value!.owner).toBe(ACCORD_PROGRAM_ID);
    expect(account.value!.data.length).toBeGreaterThan(0);
  }, 30_000);

  it("createSubaccord: creates Subaccord PDA on-chain (init + owner check)", async () => {
    if (!validatorUp) return;
    const riskType = randomBytes32();
    const { instruction, subaccord } = await createSubaccord(
      accord.adapter,
      ACCORD_PROGRAM_ID,
      payer.address,
      {
        riskType,
        evidenceSpec: randomBytes32(),
        // stakingToken is NOT validated at creation (only at stake time),
        // so a placeholder address suffices for this init smoke.
        stakingToken: payer.address,
        minStake: 1_000n,
        jurorsPerDispute: 3,
        alphaBps: 1_000,
        reviewWindow: 604_800n,
        commitWindow: 172_800n,
        revealWindow: 172_800n,
        maxAppeals: 3,
        feePerJuror: 0n,
        authority: address("11111111111111111111111111111111"), // Pubkey::default() → immutable
        evidenceOperator: payer.address,
      },
    );
    await sendIx(instruction);

    // Verify the PDA was created: account exists, owned by the program, has data.
    const account = await rpc
      .getAccountInfo(subaccord, { encoding: "base64" })
      .send();
    expect(account.value).not.toBeNull();
    expect(account.value!.owner).toBe(ACCORD_PROGRAM_ID);
    expect(account.value!.data.length).toBeGreaterThan(0);
  }, 30_000);
});
