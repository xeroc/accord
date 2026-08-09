/**
 * `useaccord dispute:ruling` — lazy read of a dispute's final ruling.
 * SDK: `getRuling` (methods/dispute.ts:232). **Read-only** (ChainCommand, no send):
 * returns `null` until the dispute reaches `Final`, then the winning option
 * index. Mirrors the on-chain `get_ruling` CPI the Arbitrable calls.
 */
import { Args } from "@oclif/core";
import type { Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class DisputeRuling extends ChainCommand {
  static summary = "Read a dispute's final ruling (null until Final)";

  static description =
    "Lazily read the final ruling of a dispute. Returns null until the dispute " +
    "reaches the Final state (no winning option yet); once finalized, prints the " +
    "winning option index. This is the same value an Arbitrable reads via the " +
    "on-chain get_ruling CPI entry. Read-only — sends nothing.";

  static examples = [
    "<%= config.bin %> dispute:ruling <dispute-pda>",
    "<%= config.bin %> dispute:ruling <dispute-pda> --json",
  ];

  static args = {
    dispute: Args.string({
      description: "Dispute PDA to read the ruling of",
      required: true,
    }),
  };

  static flags = chainFlags;

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DisputeRuling);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const ruling = await ctx.accord.methods.getRuling(args.dispute as Address);

    const data = { dispute: args.dispute, ruling };
    this.emitRead(data, {
      primary: ruling === null ? "" : String(ruling),
      human: [
        `dispute : ${args.dispute}`,
        `ruling  : ${ruling === null ? "— (not final yet)" : `option ${ruling}`}`,
      ],
    });
  }
}
