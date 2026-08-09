/**
 * `useaccord read:phase --dispute <addr> [--round <idx>]` — juror-dashboard
 * helper: derive the dispute's current phase label + window countdown.
 * SDK: `fetchMaybeDispute` + `fetchMaybeRound` + `disputePhase` (pure).
 *
 * Defaults `--round` to the dispute's `currentRound`. A not-yet-drawn dispute
 * (no Round account) yields the phase label with a null countdown.
 */
import { Flags } from "@oclif/core";

import { type Address } from "@solana/kit";

import {
  DisputeState,
  disputePhase,
  fetchMaybeDispute,
  fetchMaybeRound,
  findRoundPda,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { outFlag, serialize, writeOut } from "../../read-io.js";
import { groupBigInt, truncateAddress } from "../../lib/format.js";

export default class ReadPhase extends ChainCommand {
  static summary = "Dispute phase label + window countdown (dashboard helper)";

  static description =
    "Fetch the Dispute (+ the Round for its windows) and derive the current " +
    "phase (Pending draw / Review / Commit / Reveal / Awaiting appeal / …) " +
    "with seconds remaining. --round defaults to the dispute's currentRound.";

  static examples = [
    "<%= config.bin %> read:phase --dispute <addr>",
    "<%= config.bin %> read:phase --dispute <addr> --round 2",
  ];

  static flags = {
    ...chainFlags,
    out: outFlag,
    dispute: Flags.string({ description: "Dispute account address", required: true }),
    round: Flags.integer({ description: "Round index (default: dispute.currentRound)" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadPhase);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const dispute = await fetchMaybeDispute(ctx.accord.rpc, flags.dispute as Address);
    if (!dispute.exists) {
      const payload = { dispute: flags.dispute, exists: false };
      if (flags.out) writeOut(flags.out, payload);
      this.emitRead(payload, { primary: "", human: ["dispute : not found"] });
      return;
    }

    const d = dispute.data;
    const roundIdx = flags.round ?? d.currentRound;
    const [roundPda] = await findRoundPda({ dispute: flags.dispute as Address, roundIdx });
    const roundAccount = await fetchMaybeRound(ctx.accord.rpc, roundPda);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const info = disputePhase(
      d.state as DisputeState,
      now,
      roundAccount.exists
        ? {
            reviewEnd: roundAccount.data.reviewEnd,
            commitEnd: roundAccount.data.commitEnd,
            revealEnd: roundAccount.data.revealEnd,
          }
        : undefined,
    );

    const countdown =
      info.countdownSecs === null
        ? null
        : info.countdownSecs < 0n
          ? `overdue ${groupBigInt(-info.countdownSecs)}s`
          : `${groupBigInt(info.countdownSecs)}s`;

    const payload = {
      dispute: flags.dispute,
      roundIdx,
      state: DisputeState[d.state as DisputeState],
      phase: info.phase,
      countdownSecs: info.countdownSecs,
      round: roundAccount.exists ? roundPda : null,
    };
    if (flags.out) writeOut(flags.out, payload);

    this.emitRead(payload, {
      primary: info.phase,
      human: [
        `dispute   : ${truncateAddress(flags.dispute)}`,
        `state     : ${DisputeState[d.state as DisputeState]}`,
        `round     : ${roundIdx}${roundAccount.exists ? `  (${truncateAddress(roundPda)})` : "  (not drawn yet)"}`,
        `phase     : ${info.phase}`,
        `countdown : ${countdown ?? "—"}`,
        `tip       : ${serialize({ now }, 0)}`,
      ],
    });
  }
}
