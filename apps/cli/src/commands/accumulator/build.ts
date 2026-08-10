/**
 * `useaccord accumulator:build` — build an MST accumulator root from a leaves
 * file (SDK `buildAccumulator`, ADR-0012). Pure: no signer, no rpc, no send.
 *
 * `--leaves <file>` is a JSON array of `{juror, stake}` (juror = base58 address,
 * stake = u64 decimal string/number). Shorter arrays than `2^depth` are padded
 * with zero leaves. Emits `{rootHash, rootSum}` — the byte-exact root the
 * on-chain `Subaccord.root_hash` should hold for this stake set.
 */
import { Flags } from "@oclif/core";

import { buildAccumulator } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";
import {
  bytesToHex,
  deserializeLeaves,
  readJsonFile,
  type SerializedLeaf,
} from "../../lib/accumulator-format.js";

export default class AccumulatorBuild extends BaseCommand {
  static summary = "Build an MST accumulator root from a leaves file (pure)";

  static description =
    "Reads `--leaves` JSON `[{juror, stake}, ...]`, pads to `2^--depth`, and " +
    "computes the canonical subtree-sum root (SDK `buildAccumulator`). The " +
    "output `{rootHash, rootSum}` is the byte-exact value the on-chain " +
    "Subaccord holds for this stake set. No chain access.";

  static examples = [
    "<%= config.bin %> accumulator:build --leaves leaves.json --depth 3",
    "<%= config.bin %> accumulator:build --leaves leaves.json --depth 3 --json",
  ];

  static flags = {
    ...accordBaseFlags,
    leaves: Flags.string({
      description: "JSON file: an array of {juror: <base58>, stake: <u64 decimal|string>}",
      required: true,
    }),
    depth: Flags.integer({
      description: "Fixed tree depth (pool size = 2^depth; empty slots are zero leaves)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AccumulatorBuild);
    this.applyOutput(flags);

    const serialized = readJsonFile<SerializedLeaf[]>(flags.leaves);
    const leaves = deserializeLeaves(serialized);
    const acc = await buildAccumulator(leaves, flags.depth);

    const data = {
      rootHash: bytesToHex(acc.rootHash),
      rootSum: acc.rootSum.toString(),
      depth: acc.depth,
      leafCount: serialized.length,
    };
    this.emitRead(data, {
      primary: data.rootHash,
      human: [
        `rootHash  : ${data.rootHash}`,
        `rootSum   : ${data.rootSum}`,
        `depth     : ${data.depth}`,
        `leaves    : ${data.leafCount}/${2 ** data.depth}`,
      ],
    });
  }
}
