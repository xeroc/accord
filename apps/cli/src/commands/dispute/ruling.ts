/**
 * `useaccord dispute:ruling` — lazy read of a dispute's final ruling.
 * SDK: `getRuling` (methods/dispute.ts). **Read-only** (ChainCommand, no send):
 * returns `null` until the dispute reaches `Final`, then the ruling value —
 * the winning option index for `Plurality` pools, the final median (a u64
 * scalar in settlement-mint base units) for `Median` pools (ADR-0025).
 * Mirrors the on-chain `get_ruling` CPI the Arbitrable calls.
 */
import { Args } from "@oclif/core";
import type { Address } from "@solana/kit";

import { Aggregation, fetchMaybeDispute } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { groupBigInt } from "../../lib/format.js";

export default class DisputeRuling extends ChainCommand {
  static summary = "Read a dispute's final ruling (null until Final)";

  static description =
    "Lazily read the final ruling of a dispute. Returns null until the dispute " +
    "reaches the Final state; once finalized, prints the ruling — the winning " +
    "option index for Plurality pools, the final median (u64 scalar, base " +
    "units) for Median pools (ADR-0025). Same value an Arbitrable reads via " +
    "the on-chain get_ruling CPI entry. Read-only — sends nothing.";

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

    // Frame the human label by the dispute's frozen aggregation (ADR-0025):
    // Plurality ⇒ option index; Median ⇒ scalar in base units. One extra
    // read, human mode only (--json/--quiet already have the raw value).
    let label = `option ${ruling}`;
    if (ruling !== null && !this.out.json && !this.out.quiet) {
      const dispute = await fetchMaybeDispute(ctx.accord.rpc, args.dispute as Address);
      if (dispute.exists && dispute.data.terms.aggregation === Aggregation.Median) {
        label = `${groupBigInt(ruling)} (median scalar, base units — ADR-0025)`;
      }
    }

    const data = { dispute: args.dispute, ruling };
    this.emitRead(data, {
      primary: ruling === null ? "" : String(ruling),
      human: [
        `dispute : ${args.dispute}`,
        `ruling  : ${ruling === null ? "— (not final yet)" : label}`,
      ],
    });
  }
}
