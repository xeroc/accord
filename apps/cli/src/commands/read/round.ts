/**
 * `useaccord read:round <addr>` — fetch + decode a Round account.
 * SDK: `fetchMaybeRound`. Missing ⇒ `{exists:false}`, exit 0.
 *
 * `result`/`reveals` are u64 (ADR-0025): option indexes for Plurality pools,
 * scalars in settlement-mint base units for Median pools; `u64::MAX` = not
 * set / not revealed (rendered "—" in human mode). Human mode fetches the
 * dispute once to label which frame applies.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { Aggregation, fetchMaybeDispute, fetchMaybeRound } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadRound extends ChainCommand {
  static summary = "Fetch + decode a Round account";

  static description =
    "Read a Round by address. Decodes drawn jurors, commit/reveal counts, " +
    "window deadlines, draw_attempt, settle flag, and the u64 result/reveals " +
    "(option indexes for Plurality pools, scalars for Median — ADR-0025; " +
    "u64::MAX renders as '—'). Missing account returns {exists:false} (exit 0).";

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

    // Human mode only: one extra read to frame result/reveals by the dispute's
    // frozen aggregation (ADR-0025). JSON/quiet keep the raw values.
    const extraHuman: string[] = [];
    if (maybe.exists && !this.out.json && !this.out.quiet) {
      const dispute = await fetchMaybeDispute(ctx.accord.rpc, maybe.data.dispute);
      if (dispute.exists) {
        const median = dispute.data.terms.aggregation === Aggregation.Median;
        extraHuman.push(
          `  ${"voting".padEnd(18)}: ${median ? "median — result/reveals are scalar base units (ADR-0025)" : "plurality — result/reveals are option indexes"}`,
        );
      }
    }

    emitAccountRead(this.emitRead.bind(this), flags, maybe, "round", extraHuman);
  }
}
