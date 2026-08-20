/**
 * `useaccord canon:submit` — file an item into a CanonList (canon `submit_item`).
 * SDK: `@useaccord/canon` `submitItem`.
 *
 * The loaded wallet is the submitter (fee payer + deposit source + sole
 * withdrawer). The deposit is the list's frozen `submit_deposit` (on-chain
 * enforces an exact match — `DepositMismatch`); the CLI reads it from the list
 * so the flag can never drift. `--account` is the curated address — a PDA owned
 * by the list's `list_program` unless the list was created with the sentinel.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { findAssociatedTokenAddress } from "@useaccord/sdk";
import { submitItem } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { requireCanonList } from "../../canon-context.js";
import { parseHash32 } from "../dispute/create.js";

const ZERO_EVIDENCE = new Uint8Array(32);

export default class CanonSubmit extends ChainCommand {
  static summary = "Submit an item to a Canon list (locks the submit deposit)";

  static description =
    "Submit `--account` for curation. Inits the CanonItem PDA " +
    '`["canon-item", list, account]` in Pending and locks the list\'s ' +
    "submit_deposit (fee_mint) from the submitter into the list vault. The " +
    "deposit is read from the list — it must match exactly (DepositMismatch). " +
    "The item auto-lists after the listing window unless challenged.";

  static examples = [
    "<%= config.bin %> canon:submit --list <pda> --account <addr>",
    "<%= config.bin %> canon:submit --list <pda> --account <addr> --evidence <hex64>",
  ];

  static flags = {
    ...chainFlags,
    list: Flags.string({ description: "CanonList PDA address", required: true }),
    account: Flags.string({
      description:
        "The curated address (PDA owned by the list's list_program, or any address on a sentinel list)",
      required: true,
    }),
    evidence: Flags.string({
      description: "Evidence commitment hash (32-byte hex). Defaults to 32 zero bytes",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonSubmit);
    this.applyOutput(flags);

    const evidence = flags.evidence ? parseHash32(flags.evidence, "evidence") : ZERO_EVIDENCE;

    const ctx = await this.loadChain(flags);
    const listAddr = flags.list as Address;
    const list = await requireCanonList(ctx, listAddr);

    const submitterTokenAccount = await findAssociatedTokenAddress(
      list.feeMint,
      ctx.signer.address,
    );
    const vault = await findAssociatedTokenAddress(list.feeMint, listAddr);

    const { instruction, item } = await submitItem(
      {
        submitter: ctx.signer,
        list: listAddr,
        account: flags.account as Address,
        feeMint: list.feeMint,
        submitterTokenAccount,
        vault,
      },
      { evidence, deposit: list.submitDeposit },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { item, deposit: list.submitDeposit });
  }
}
