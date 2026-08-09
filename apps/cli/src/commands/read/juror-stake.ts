/**
 * `useaccord read:juror-stake <addr>` — fetch + decode a JurorStake account.
 * SDK: `fetchMaybeJurorStake`. Missing ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeJurorStake } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadJurorStake extends ChainCommand {
  static summary = "Fetch + decode a JurorStake account";

  static description =
    "Read a JurorStake by address. Decodes staked collateral, active draws, " +
    "slash reserve, pending withdrawal, and earned fees. Missing account " +
    "returns {exists:false} (exit 0).";

  static examples = [
    "<%= config.bin %> read:juror-stake <addr>",
    "<%= config.bin %> read:juror-stake <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({ description: "JurorStake account address", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(ReadJurorStake);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeJurorStake(ctx.accord.rpc, args.address as Address);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "jurorStake");
  }
}
