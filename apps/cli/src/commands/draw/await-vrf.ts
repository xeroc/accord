/**
 * `useaccord draw:await-vrf` — poll a Dispute's `committed_vrf` until the VRF
 * oracle callback lands (or the timeout elapses). SDK: `methods.awaitCommittedVrf`
 * (vrf.ts:295). Read-only.
 *
 * Use between `draw:request-vrf` and `draw:resolve-seat` to block until the
 * 32-byte randomness is on-chain. Emits the hex VRF (the same bytes the seat
 * resolver feeds into the sortition hash).
 */
import { Flags } from "@oclif/core";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { bytesToHex, parseAddress } from "../../lib/draw-shared.js";

export default class DrawAwaitVrf extends ChainCommand {
  static summary = "Poll a Dispute until its committed_vrf lands (read-only)";

  static description =
    "Block until `dispute.committed_vrf` is `Some` (the VRF oracle callback has " +
    "fired), polling every `--poll` ms up to `--timeout` ms. Returns the 32-byte " +
    "randomness as hex. Pair with `draw:request-vrf`; on a Surfnet (where the " +
    "oracle is absent) this will time out unless `committed_vrf` is injected.";

  static examples = [
    "<%= config.bin %> draw:await-vrf --dispute <addr>",
    "<%= config.bin %> draw:await-vrf --dispute <addr> --timeout 60000 --poll 250",
  ];

  static flags = {
    ...chainFlags,
    dispute: Flags.string({
      description: "The Dispute PDA to poll",
      required: true,
    }),
    timeout: Flags.integer({
      description: "Give up after this many ms",
      char: "t",
      default: 30_000,
    }),
    poll: Flags.integer({
      description: "Poll interval in ms",
      char: "p",
      default: 400,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DrawAwaitVrf);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const vrf = await ctx.accord.methods.awaitCommittedVrf(parseAddress(flags.dispute, "dispute"), {
      timeoutMs: flags.timeout,
      pollIntervalMs: flags.poll,
    });
    const hex = bytesToHex(vrf);

    this.emitRead(
      { dispute: flags.dispute, committedVrf: hex },
      {
        primary: hex,
        human: [`dispute      : ${flags.dispute}`, `committedVrf : ${hex}`],
      },
    );
  }
}
