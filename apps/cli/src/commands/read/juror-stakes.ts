/**
 * `useaccord read:juror-stakes` — bulk JurorStake query. Exactly one of
 * `--by-subaccord <addr>` | `--by-juror <addr>`. SDK:
 * `findJurorStakesBySubaccord` / `findJurorStakesByJuror`.
 */
import { Flags } from "@oclif/core";

import { type Address } from "@solana/kit";

import { findJurorStakesByJuror, findJurorStakesBySubaccord } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitListRead, outFlag } from "../../read-io.js";

export default class ReadJurorStakes extends ChainCommand {
  static summary = "List JurorStakes by subaccord or juror";

  static description =
    "Bulk JurorStake query via getProgramAccounts. Pass exactly one filter: " +
    "--by-subaccord <addr> (the draw pool / accumulator rebuild) or " +
    "--by-juror <addr> (capital across all Subaccords).";

  static examples = [
    "<%= config.bin %> read:juror-stakes --by-subaccord <addr>",
    "<%= config.bin %> read:juror-stakes --by-juror <addr>",
  ];

  static flags = {
    ...chainFlags,
    out: outFlag,
    "by-subaccord": Flags.string({ description: "Filter: stakes under this Subaccord" }),
    "by-juror": Flags.string({ description: "Filter: stakes owned by this juror" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadJurorStakes);
    this.applyOutput(flags);

    if ((flags["by-subaccord"] ? 1 : 0) + (flags["by-juror"] ? 1 : 0) !== 1) {
      this.error("pass exactly one of --by-subaccord or --by-juror", { exit: 1 });
    }

    const ctx = await this.loadChain(flags);
    const accounts = flags["by-subaccord"]
      ? await findJurorStakesBySubaccord(ctx.accord.rpc, flags["by-subaccord"] as Address)
      : await findJurorStakesByJuror(ctx.accord.rpc, flags["by-juror"] as Address);
    emitListRead(this.emitRead.bind(this), flags, accounts, "jurorStakes");
  }
}
