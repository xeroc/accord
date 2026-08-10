/**
 * `useaccord accumulator:empty-root` — root hash of an all-zero tree at `--depth`
 * (SDK `emptyRoot`, ADR-0012). Pure.
 *
 * This is the root a fresh Subaccord holds before any juror stakes. Useful as a
 * sanity check that the on-chain `root_hash` matches a never-staked-to pool and
 * as the base case for incremental accumulator updates.
 */
import { Flags } from "@oclif/core";

import { emptyRoot } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";
import { bytesToHex } from "../../lib/accumulator-format.js";

export default class AccumulatorEmptyRoot extends BaseCommand {
  static summary = "Root hash of an all-zero (never-staked) tree at --depth (pure)";

  static description =
    "Computes the subtree-sum root of a tree where every leaf is the zero leaf " +
    "`(0^32, 0)` at `--depth` (SDK `emptyRoot`). This is the root a fresh " +
    "Subaccord holds before any juror stakes. No chain access.";

  static examples = [
    "<%= config.bin %> accumulator:empty-root --depth 16",
    "<%= config.bin %> accumulator:empty-root --depth 16 --quiet",
  ];

  static flags = {
    ...accordBaseFlags,
    depth: Flags.integer({
      description: "Tree depth (root of 2^depth zero leaves)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AccumulatorEmptyRoot);
    this.applyOutput(flags);

    const root = await emptyRoot(flags.depth);
    const rootHex = bytesToHex(root);
    this.emitRead(
      { depth: flags.depth, rootHash: rootHex },
      {
        primary: rootHex,
        human: [`depth   : ${flags.depth}`, `rootHash : ${rootHex}`],
      },
    );
  }
}
