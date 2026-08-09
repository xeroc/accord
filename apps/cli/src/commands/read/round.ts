/**
 * `useaccord read:round <addr>` — fetch + decode a Round account.
 * SDK: `fetchMaybeRound`. Missing ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeRound } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadRound extends ChainCommand {
  static summary = "Fetch + decode a Round account";

  static description =
    "Read a Round by address. Decodes drawn jurors, commit/reveal counts, " +
    "window deadlines, draw_attempt, and settle flag. Missing account " +
    "returns {exists:false} (exit 0).";

  static examples = [
    "<%= config.bin %> read:round <addr>",
    "<%= config.bin %> read:round <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({ description: "Round account address", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(ReadRound);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeRound(ctx.accord.rpc, args.address as Address);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "round");
  }
}
