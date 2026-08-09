/**
 * BaseCommand — shared flag inheritance + the build→sign→send pipeline shared
 * by every operator command. Each concrete command spreads `baseFlags` and
 * calls {@link BaseCommand#sendInstruction} with the instruction built via the
 * `@useaccord/sdk` facade.
 *
 * The send pipeline mirrors `tests/src/setup/env.ts#sendIx`: assemble a v0
 * message over the latest blockhash, set the facade signer as fee payer, sign,
 * and confirm. The signer is the on-chain authority wherever the adapter
 * hard-wires `accord.signer` (e.g. `initialize_pause`, `pause`).
 */
import { Command, Flags } from "@oclif/core";
import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

import { Accord } from "@useaccord/sdk";

/**
 * Flags every operator command needs: where to talk to Solana and who pays.
 * `wallet` defaults to `$ANCHOR_WALLET`; `rpc` to the local validator.
 */
export const accordFlags = {
  rpc: Flags.string({
    description: "Solana JSON-RPC endpoint",
    summary: "Solana JSON-RPC endpoint",
    char: "r",
    env: "ACCORD_RPC_URL",
    default: "http://127.0.0.1:8899",
  }),
  ws: Flags.string({
    description: "Solana WebSocket endpoint (defaults to the ws counterpart of --rpc)",
    summary: "Solana WebSocket endpoint",
    char: "w",
    env: "ACCORD_WS_URL",
  }),
  wallet: Flags.string({
    description: "Path to a Solana keypair JSON file (uint8 array). Defaults to $ANCHOR_WALLET.",
    summary: "Path to keypair JSON ($ANCHOR_WALLET)",
    char: "k",
    env: "ANCHOR_WALLET",
    required: true,
  }),
};

export abstract class BaseCommand extends Command {
  /**
   * Build, sign, and confirm a single instruction as a v0 transaction, with the
   * facade's signer as both fee payer and signing authority. Returns the
   * transaction signature.
   */
  protected async sendInstruction(
    accord: Accord,
    instruction: Instruction,
    wsEndpoint: string,
    signer: TransactionSigner,
  ): Promise<string> {
    const sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc: accord.rpc,
      rpcSubscriptions: createSolanaRpcSubscriptions(wsEndpoint),
    });

    const { value: latestBlockhash } = await accord.rpc.getLatestBlockhash().send();

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
  }
}
