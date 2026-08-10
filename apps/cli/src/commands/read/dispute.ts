/**
 * `useaccord read:dispute <addr>` — fetch + decode a Dispute account.
 * SDK: `fetchMaybeDispute`. Missing ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeDispute } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadDispute extends ChainCommand {
  static summary = "Fetch + decode a Dispute account";

  static description =
    "Read a Dispute by address. Decodes state, current round, filer, terms " +
    "snapshot, frozen VRF + accumulator root, and final ruling. Missing " +
    "account returns {exists:false} (exit 0).";

  static examples = [
    "<%= config.bin %> read:dispute <addr>",
    "<%= config.bin %> read:dispute <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({ description: "Dispute account address", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(ReadDispute);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeDispute(ctx.accord.rpc, args.address as Address);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "dispute");
  }
}
