/**
 * `useaccord accumulator:prepare-stake-proof` — fetch a Subaccord + all its
 * JurorStake accounts on-chain and build the canonical MST proof for `--juror`
 * (SDK `prepareStakeProof`, ADR-0012). Reads chain; never sends.
 *
 * The output is the proof file schema (`{version, index, path}`) that
 * `staking --path-from` consumes, plus `isNewStaker`, `rootHash`, and `rootSum`
 * for audit. Throws `AccumulatorRootMismatch` (via the SDK) if the local rebuild
 * diverges from the on-chain root — a sign of stale data (concurrent stake).
 */
import { Flags } from "@oclif/core";

import { type Address } from "@solana/kit";
import {
  fetchMaybeSubaccord,
  findJurorStakesBySubaccord,
  prepareStakeProof,
  type SubaccordAccumulatorView,
  type JurorStakeLeaf,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { truncateAddress } from "../../lib/format.js";
import { bytesToHex, proofToFile } from "../../lib/accumulator-format.js";

export default class AccumulatorPrepareStakeProof extends ChainCommand {
  static summary = "Fetch Subaccord + JurorStakes and build the canonical proof for --juror";

  static description =
    "Reads the on-chain Subaccord (`--subaccord`) and all its JurorStake " +
    "accounts, rebuilds the accumulator, verifies the root matches, and emits " +
    "the proof file for `--juror` (SDK `prepareStakeProof`). For an existing " +
    "staker the proof authenticates their slot; for a new staker it authenticates " +
    "the next free leaf (`nextIndex`). Reads chain; does not send. " +
    "Throws on a root mismatch (stale data — retry with fresh state).";

  static examples = [
    "<%= config.bin %> accumulator:prepare-stake-proof --subaccord 7Nq.. --juror 3vbY..",
    "<%= config.bin %> accumulator:prepare-stake-proof -r $RPC --subaccord 7Nq.. --juror 3vbY.. --json > proof.json",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address (base58)",
      required: true,
    }),
    juror: Flags.string({
      description: "Juror address the proof is for (base58)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AccumulatorPrepareStakeProof);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);

    const subaccordAddr = flags.subaccord as Address;
    const jurorAddr = flags.juror as Address;

    const sub = await fetchMaybeSubaccord(ctx.accord.rpc, subaccordAddr);
    if (!sub.exists) {
      this.error(`Subaccord not found: ${flags.subaccord}`, { exit: 1 });
    }
    const view: SubaccordAccumulatorView = {
      rootHash: new Uint8Array(sub.data.rootHash),
      nextIndex: sub.data.nextIndex,
      depth: sub.data.depth,
    };

    const accounts = await findJurorStakesBySubaccord(ctx.accord.rpc, subaccordAddr);
    const leaves: JurorStakeLeaf[] = accounts.map((a) => ({
      juror: a.data.juror,
      staked: a.data.staked,
      treeIndex: a.data.treeIndex,
    }));

    const result = await prepareStakeProof(view, leaves, jurorAddr);
    const file = proofToFile(result.index, result.path);

    this.emitRead(
      {
        ...file,
        isNewStaker: result.isNewStaker,
        rootHash: bytesToHex(result.accumulator.rootHash),
        rootSum: result.accumulator.rootSum.toString(),
      },
      {
        primary: bytesToHex(result.accumulator.rootHash),
        human: [
          `subaccord : ${truncateAddress(flags.subaccord)}`,
          `juror     : ${truncateAddress(flags.juror)}`,
          `index     : ${file.index}`,
          `new       : ${result.isNewStaker}`,
          `path len  : ${file.path.length}`,
          `rootHash  : ${bytesToHex(result.accumulator.rootHash)}`,
          `rootSum   : ${result.accumulator.rootSum}`,
        ],
      },
    );
  }
}
