/**
 * `useaccord draw:seat` — submit ONE seat's `draw_seat` instruction (sends).
 * SDK: `methods.drawSeat` (vrf.ts:320).
 *
 * Consumes the `SeatMembership` JSON produced by `draw:resolve-seat` (via
 * `--membership <file|->`) and submits a single `draw_seat` for `--seat` in
 * `--round`. The round PDA is `init_if_needed` on-chain; the loaded wallet is
 * `caller` (fee payer + cranker).
 *
 * One seat per transaction because a 1232B tx can't hold N proof paths — use
 * `draw:submit-panel` to submit the whole panel in a loop.
 */
import { Flags } from "@oclif/core";
import { findRoundPda } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { membershipFromJson, parseAddress, readInput } from "../../lib/draw-shared.js";

export default class DrawSeat extends ChainCommand {
  static summary = "Submit one draw_seat instruction (sends one transaction)";

  static description =
    "Consume a `SeatMembership` JSON artifact (from `draw:resolve-seat`) and " +
    "send one `draw_seat` instruction for `--seat` in `--round`. The round PDA " +
    '`["round", dispute, round]` is `init_if_needed` on-chain. The loaded ' +
    "wallet is `caller`. Use `--dry-run` to inspect the built instruction " +
    "without sending.";

  static examples = [
    "<%= config.bin %> draw:seat --dispute <a> --subaccord <a> --seat 0 " +
      "--membership seat0.json",
    "<%= config.bin %> draw:resolve-seat --dispute <a> --seat 0 | " +
      "bun run bin/dev.js draw:seat --dispute <a> --subaccord <a> --seat 0 " +
      "--membership -",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "The Dispute's parent Subaccord PDA",
      required: true,
    }),
    dispute: Flags.string({ description: "The Dispute PDA", required: true }),
    round: Flags.integer({
      description: "Round index (selects the round PDA)",
      char: "r",
      default: 0,
    }),
    seat: Flags.integer({
      description: "Seat index within the round (0-based)",
      char: "s",
      required: true,
    }),
    membership: Flags.string({
      description: "SeatMembership JSON from resolve-seat (`-` = stdin, or a file)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DrawSeat);
    this.applyOutput(flags);

    const membership = membershipFromJson(JSON.parse(readInput(flags.membership)));

    const ctx = await this.loadChain(flags);
    const dispute = parseAddress(flags.dispute, "dispute");
    const [roundPda] = await findRoundPda({
      dispute,
      roundIdx: flags.round,
    });
    const instruction = ctx.accord.methods.drawSeat(
      {
        caller: ctx.signer.address,
        subaccord: parseAddress(flags.subaccord, "subaccord"),
        dispute,
      },
      roundPda,
      flags.seat,
      membership,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      dispute: flags.dispute,
      seat: flags.seat,
      round: flags.round,
      jurorStake: membership.jurorStake,
    });
  }
}
