/**
 * `useaccord accumulator:proof` — compute the Merkle path for a leaf index in a
 * rebuilt accumulator (SDK `proofFor`, ADR-0012). Pure.
 *
 * Reads `--leaves` + `--depth`, rebuilds the tree, and emits the proof file
 * schema (`{version, index, path}`) for `--index`. This is exactly what
 * `staking --path-from` consumes and what `accumulator:verify --path` checks.
 */
import { Flags } from "@oclif/core";

import { proofFor, buildAccumulator } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";
import {
  bytesToHex,
  deserializeLeaves,
  proofToFile,
  readJsonFile,
  type SerializedLeaf,
} from "../../lib/accumulator-format.js";

export default class AccumulatorProof extends BaseCommand {
  static summary = "Compute the Merkle proof for a leaf index (pure)";

  static description =
    "Rebuilds the accumulator from `--leaves` + `--depth`, then emits the " +
    "proof file schema `{version, index, path}` for `--index` (SDK `proofFor`). " +
    "The output is the on-disk format `staking --path-from` reads and " +
    "`accumulator:verify --path` checks. No chain access.";

  static examples = [
    "<%= config.bin %> accumulator:proof --leaves leaves.json --depth 3 --index 0",
    "<%= config.bin %> accumulator:proof --leaves leaves.json --depth 3 --index 0 --json > proof.json",
  ];

  static flags = {
    ...accordBaseFlags,
    leaves: Flags.string({
      description: "JSON file: an array of {juror: <base58>, stake: <u64 decimal|string>}",
      required: true,
    }),
    depth: Flags.integer({
      description: "Fixed tree depth the accumulator was built with",
      required: true,
    }),
    index: Flags.integer({
      description: "Leaf index to prove (0..<2^depth)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AccumulatorProof);
    this.applyOutput(flags);

    const serialized = readJsonFile<SerializedLeaf[]>(flags.leaves);
    const leaves = deserializeLeaves(serialized);
    const acc = await buildAccumulator(leaves, flags.depth);
    const path = await proofFor(acc, flags.index);

    const file = proofToFile(flags.index, path);
    this.emitRead(file, {
      primary: bytesToHex(acc.rootHash),
      human: [
        `index     : ${file.index}`,
        `path len  : ${file.path.length}`,
        `rootHash  : ${bytesToHex(acc.rootHash)}`,
        ...file.path.map((n, i) => `  [${i}] sib: ${n.siblingHash}  sum: ${n.siblingSum}`),
      ],
    });
  }
}
