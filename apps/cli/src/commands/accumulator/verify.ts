/**
 * `useaccord accumulator:verify` — verify a leaf authenticates against a known
 * root and return its sortition prefix (SDK `verifyMembership`, ADR-0012). Pure.
 *
 * `--leaf` is inline JSON `{"juror":"<base58>","stake":"<u64>"}` or a path to
 * such a file. `--path` is the proof file emitted by `accumulator:proof` /
 * `accumulator:prepare-stake-proof`. `--root` is the 32-byte hex root;
 * `--root-sum` is the u64 total stake. Emits `{ok, prefix}` — `prefix` is the
 * cumulative-from-left stake; the leaf's sortition range is
 * `[prefix, prefix + stake)`.
 */
import { Flags } from "@oclif/core";

import { verifyMembership } from "@useaccord/sdk";

import { accordBaseFlags, BaseCommand } from "../../lib/base-command.js";
import {
  deserializeLeaf,
  fileToProof,
  hexToBytes,
  readJsonArgOrFile,
  type ProofFile,
  type SerializedLeaf,
} from "../../lib/accumulator-format.js";

export default class AccumulatorVerify extends BaseCommand {
  static summary = "Verify a leaf+path against a root; return the sortition prefix (pure)";

  static description =
    "Checks that `--leaf` at its index authenticates against `--root` + " +
    "`--root-sum` using `--path` (SDK `verifyMembership`). Emits `{ok, prefix}`. " +
    "`ok=false` means the proof, root, or root-sum is wrong. `prefix` is the " +
    "cumulative-from-left stake used by draw sortition. No chain access.";

  static examples = [
    '<%= config.bin %> accumulator:verify --leaf \'{"juror":"7Nq..","stake":"1000"}\' \\\n' +
      "  --path proof.json --root ab12… --root-sum 9000",
  ];

  static flags = {
    ...accordBaseFlags,
    leaf: Flags.string({
      description:
        'Leaf as inline JSON {"juror":"<base58>","stake":"<u64>"} or a path to such a file',
      required: true,
    }),
    index: Flags.integer({
      description: "Leaf index (must match the proof)",
      required: true,
    }),
    path: Flags.string({
      description: "Proof file (output of accumulator:proof / prepare-stake-proof)",
      required: true,
    }),
    root: Flags.string({
      description: "32-byte root hash (lowercase hex, no 0x)",
      required: true,
    }),
    "root-sum": Flags.string({
      description: "Total stake (u64 decimal string)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AccumulatorVerify);
    this.applyOutput(flags);

    const leafSer = readJsonArgOrFile<SerializedLeaf>(flags.leaf);
    const leaf = deserializeLeaf(leafSer);
    const file = readJsonArgOrFile<ProofFile>(flags.path);
    // index in the proof file is authoritative; --index must match.
    const { index, path } = fileToProof(file);
    if (index !== flags.index) {
      this.error(`--index ${flags.index} does not match proof file index ${index}`, { exit: 1 });
    }
    const rootHash = hexToBytes(flags.root);
    const rootSum = BigInt(flags["root-sum"]);

    const result = await verifyMembership(leaf, index, path, rootHash, rootSum);
    this.emitRead(
      { ...result, prefix: result.prefix.toString() },
      {
        primary: String(result.ok),
        human: [`ok     : ${result.ok}`, `prefix : ${result.prefix}`, `index  : ${index}`],
      },
    );
  }
}
