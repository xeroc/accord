/**
 * `useaccord read:disputes` — bulk Dispute query. Exactly one of
 * `--by-subaccord <addr>` | `--by-filer <addr>` | `--all`. SDK:
 * `findDisputesBySubaccord` / `findDisputesByFiler` / `findAllDisputes`.
 */
import { Flags } from "@oclif/core";

import { type Address } from "@solana/kit";

import { findAllDisputes, findDisputesByFiler, findDisputesBySubaccord } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitListRead, outFlag } from "../../read-io.js";

export default class ReadDisputes extends ChainCommand {
  static summary = "List Disputes by subaccord, filer, or all";

  static description =
    "Bulk Dispute query via getProgramAccounts. Pass exactly one filter: " +
    "--by-subaccord <addr>, --by-filer <addr>, or --all. Returns decoded " +
    "Dispute accounts with their addresses.";

  static examples = [
    "<%= config.bin %> read:disputes --by-subaccord <addr>",
    "<%= config.bin %> read:disputes --by-filer <addr>",
    "<%= config.bin %> read:disputes --all",
  ];

  static flags = {
    ...chainFlags,
    out: outFlag,
    "by-subaccord": Flags.string({ description: "Filter: disputes under this Subaccord" }),
    "by-filer": Flags.string({ description: "Filter: disputes filed by this address" }),
    all: Flags.boolean({ description: "No filter — every Dispute on the program", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadDisputes);
    this.applyOutput(flags);

    const filters = [flags["by-subaccord"], flags["by-filer"], flags.all].filter(Boolean);
    if (filters.length !== 1) {
      this.error("pass exactly one of --by-subaccord, --by-filer, or --all", { exit: 1 });
    }

    const ctx = await this.loadChain(flags);
    let accounts;
    if (flags["by-subaccord"]) {
      accounts = await findDisputesBySubaccord(ctx.accord.rpc, flags["by-subaccord"] as Address);
    } else if (flags["by-filer"]) {
      accounts = await findDisputesByFiler(ctx.accord.rpc, flags["by-filer"] as Address);
    } else {
      accounts = await findAllDisputes(ctx.accord.rpc);
    }
    emitListRead(this.emitRead.bind(this), flags, accounts, "disputes");
  }
}
