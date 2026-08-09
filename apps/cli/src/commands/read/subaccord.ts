/**
 * `useaccord read:subaccord <addr>` — fetch + decode a Subaccord account.
 * SDK: `fetchMaybeSubaccord`. Missing account ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeSubaccord } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadSubaccord extends ChainCommand {
  static summary = "Fetch + decode a Subaccord account";

  static description =
    "Read a Subaccord by its on-chain address. Decodes creator, staking/fee " +
    "mints, economics (min_stake, alpha, windows), and panel config. Missing " +
    "account returns {exists:false} (exit 0), not an error.";

  static examples = [
    "<%= config.bin %> read:subaccord AaNWS…XVG9",
    "<%= config.bin %> read:subaccord <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({
      description: "Subaccord account address",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(ReadSubaccord);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeSubaccord(ctx.accord.rpc, args.address as Address);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "subaccord");
  }
}
