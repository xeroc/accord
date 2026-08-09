/**
 * Base command hierarchy for the `useaccord` CLI (CLI.md §2 "global flags").
 *
 * Two tiers:
 *   - {@link BaseCommand} — output modes (`--json`, `--quiet`) + error handling.
 *     Every command extends it, including pure/offline ones (`accumulator:*`).
 *   - {@link ChainCommand} — adds the chain-touching flags (`--rpc`, `--keypair`,
 *     `--commitment`, `--dry-run`, `--program-id`), loads the {@link Accord}
 *     facade, and runs the build→sign→send pipeline.
 *
 * Single-signer model (CLI.md §7 Q5): the `--keypair` wallet is the fee payer
 * AND the instruction's signing account for every command — the SDK adapter
 * pins `accord.signer` as that account (ADR-0010). No `--as` / `--signer-pays`.
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
  type AccountRole,
  type Commitment,
  type Instruction,
  type KeyPairSigner,
  type TransactionSigner,
} from "@solana/kit";

import { Accord } from "@useaccord/sdk";

import { accountRoleLabel } from "./format.js";
import { toCliError } from "./errors.js";
import { renderCreated, renderRead, renderSend, type OutputFlags } from "./output.js";
import { defaultWsEndpoint, loadKeypair, resolveKeypairPath } from "./wallet.js";

/** Output-mode flags present on every command (pure + chain). */
export const accordBaseFlags = {
  json: Flags.boolean({
    description: "Emit a single JSON object on stdout (for jq)",
    default: false,
  }),
  quiet: Flags.boolean({
    description: "Only print the signature (send) or address (create/read)",
    char: "q",
    default: false,
  }),
};

/** Chain-touching flags; spread into a {@link ChainCommand}'s `static flags`. */
export const chainFlags = {
  ...accordBaseFlags,
  rpc: Flags.string({
    description: "Solana JSON-RPC endpoint",
    char: "r",
    env: "ACCORD_RPC_URL",
    default: "http://127.0.0.1:8899",
  }),
  ws: Flags.string({
    description: "Solana WebSocket endpoint (defaults to the ws counterpart of --rpc)",
    char: "w",
    env: "ACCORD_WS_URL",
  }),
  keypair: Flags.string({
    description: "Path to keypair JSON ($ANCHOR_WALLET | $ACCORD_KEYPAIR_PATH)",
    char: "k",
  }),
  commitment: Flags.string({
    description: "Commitment level for send + reads",
    default: "confirmed",
    options: ["processed", "confirmed", "finalized"],
  }),
  "dry-run": Flags.boolean({
    description: "Build + print the instruction (accounts, data hex); do not sign/send",
    default: false,
  }),
  "program-id": Flags.string({
    description: "Override the Accord program id (testing only)",
    hidden: true,
  }),
};

/** Resolved chain context handed to a {@link ChainCommand}'s `run()`. */
export interface ChainContext {
  accord: Accord;
  signer: KeyPairSigner;
  ws: string;
  commitment: Commitment;
}

export abstract class BaseCommand extends Command {
  /** Output-mode flags, captured after parse so `catch()` can read them. */
  protected out: OutputFlags = {};

  /** Capture output flags from a parsed flag set (call once after `this.parse`). */
  protected applyOutput(flags: OutputFlags): void {
    this.out = { json: flags.json, quiet: flags.quiet };
  }

  // -- emitters: log the rendered string for the active output mode ----------

  protected emitSend(signature: string, extra: Record<string, unknown> = {}): void {
    this.log(renderSend(this.out, signature, extra));
  }

  protected emitCreated(address: string, extra: Record<string, unknown> = {}): void {
    this.log(renderCreated(this.out, address, extra));
  }

  protected emitRead(data: unknown, opts: { primary?: string; human?: string[] } = {}): void {
    this.log(renderRead(this.out, data, opts));
  }

  /**
   * oclif error hook. Maps any thrown value via {@link toCliError} and prints in
   * the active output mode: `--json` ⇒ `{ error, message, hint? }` on stderr;
   * human ⇒ the message + hint on stderr. Exits non-zero.
   */
  protected async catch(err: Error & { oclif?: { exit?: number } }): Promise<unknown> {
    if (err?.oclif?.exit !== undefined) {
      // oclif's own structured errors (e.g. missing required flag) — let it handle.
      return super.catch(err);
    }
    const cliError = toCliError(err);
    if (this.out.json) {
      process.stderr.write(
        JSON.stringify({ error: cliError.error, message: cliError.message, hint: cliError.hint }) +
          "\n",
      );
    } else {
      process.stderr.write(`✗ ${cliError.error}: ${cliError.message}\n`);
      if (cliError.hint) process.stderr.write(`  hint: ${cliError.hint}\n`);
    }
    this.exit(cliError.exitCode);
  }
}

export abstract class ChainCommand extends BaseCommand {
  static flags = chainFlags;

  /**
   * Resolve the chain context from flags: load the keypair (single-signer
   * model), build the {@link Accord} facade, derive the ws endpoint.
   */
  protected async loadChain(flags: {
    rpc: string;
    ws?: string;
    keypair?: string;
    commitment: string;
    "program-id"?: string;
  }): Promise<ChainContext> {
    if (flags["program-id"] && flags["program-id"] !== Accord.PROGRAM_ID) {
      this.error(
        `--program-id override is not wired through the bound facade (canonical: ${Accord.PROGRAM_ID}). ` +
          "Use the SDK pure functions with an explicit programId for testing.",
        { exit: 1 },
      );
    }

    const signer = await loadKeypair(resolveKeypairPath(flags.keypair));
    const accord = new Accord({ endpoint: flags.rpc, signer });
    return {
      accord,
      signer,
      ws: flags.ws ?? defaultWsEndpoint(flags.rpc),
      commitment: flags.commitment as Commitment,
    };
  }

  /**
   * Build, sign, and confirm a single instruction as a v0 transaction. The
   * loaded signer is both fee payer and the instruction's signing account.
   */
  protected async sendInstruction(ctx: ChainContext, instruction: Instruction): Promise<string> {
    const { accord, signer, ws, commitment } = ctx;
    const sendAndConfirm = sendAndConfirmTransactionFactory({
      rpc: accord.rpc,
      rpcSubscriptions: createSolanaRpcSubscriptions(ws),
    });

    const { value: latestBlockhash } = await accord.rpc.getLatestBlockhash({ commitment }).send();

    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(signer as TransactionSigner, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
      (tx) => appendTransactionMessageInstructions([instruction], tx),
    );

    const signed = await signTransactionMessageWithSigners(message);
    assertIsTransactionWithBlockhashLifetime(signed);
    await sendAndConfirm(signed, { commitment });
    return getSignatureFromTransaction(signed);
  }

  /** `--dry-run` dump: program, accounts (with roles), instruction data hex. */
  protected emitDryRun(instruction: Instruction): void {
    const accounts = (instruction.accounts ?? []).map((m) => ({
      address: m.address,
      role: accountRoleLabel(m.role as AccountRole),
    }));
    const data = instruction.data ? new Uint8Array(instruction.data) : new Uint8Array();
    const dataHex = toHex(data);
    if (this.out.json) {
      this.log(
        JSON.stringify({ programAddress: instruction.programAddress, accounts, data: dataHex }),
      );
    } else {
      const lines = [
        "[dry-run] instruction built; not sending.",
        `  program : ${instruction.programAddress}`,
      ];
      for (const [i, a] of accounts.entries()) {
        lines.push(`  acct[${i}] : ${a.address}  (${a.role})`);
      }
      lines.push(`  data    : ${dataHex}`);
      this.log(lines.join("\n"));
    }
  }
}

/** Uint8Array → lowercase hex string (no `0x` prefix). */
function toHex(bytes: Uint8Array): string {
  const head = Array.from(bytes.slice(0, 256))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return bytes.length > 256 ? `${head}… (+${bytes.length - 256} bytes)` : head;
}
