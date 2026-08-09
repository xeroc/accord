/**
 * `useaccord appeal:cost` — quote the panel + fee + bond for opening the next
 * appeal round (pure, offline). SDK: `appealCost` (methods/appeal.ts).
 *
 * Mirrors lib.rs:1416-1430: given the round being appealed FROM
 * (`--current-round`) and the per-juror fee, the next round opens at
 * `panel_size_for_round(current + 1)` jurors (= 2N+1 ladder: 3 → 7 → 15 → 31).
 * The appellant pays `fee_new` (= panel · fee_per_juror) plus an equal bond,
 * so `total = 2 · fee_new`. The same `appealCost` drives the on-chain `appeal`
 * math, so this command's `total` is exactly what `appeal:open` posts.
 *
 * Extends `BaseCommand` (no chain, no signer) — usable for cost planning before
 * a dispute exists.
 */
import { Flags } from "@oclif/core";

import { appealCost } from "@useaccord/sdk";

import { BaseCommand, accordBaseFlags } from "../../lib/base-command.js";
import { groupBigInt } from "../../lib/format.js";

export default class AppealCost extends BaseCommand {
  static summary = "Quote panel + fee + bond for the next appeal round (pure, no chain)";

  static description =
    "Compute the appeal cost breakdown for opening round `--current-round + 1` " +
    "from a Subaccord's per-juror fee. Panel follows the 2N+1 ladder " +
    "(3 → 7 → 15 → 31). `total` = new-round fee + equal bond; the bond is " +
    "forfeited on no-flip and refunded on flip. This is the exact amount " +
    "`appeal:open` transfers, so it can be used to pre-fund the appellant.";

  static examples = [
    "<%= config.bin %> appeal:cost --current-round 0 --fee-per-juror 1000000",
    "<%= config.bin %> appeal:cost --current-round 1 --fee-per-juror 2500 --json",
  ];

  static flags = {
    ...accordBaseFlags,
    "current-round": Flags.integer({
      description: "The round index being appealed FROM (current_round)",
      required: true,
    }),
    "fee-per-juror": Flags.string({
      description: "Per-juror fee in base units (e.g. lamports), as an integer string",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppealCost);
    this.applyOutput(flags);

    let feePerJuror: bigint;
    try {
      feePerJuror = BigInt(flags["fee-per-juror"]);
    } catch {
      this.error(
        `--fee-per-juror must be an integer base amount, got "${flags["fee-per-juror"]}"`,
        {
          exit: 1,
        },
      );
    }
    if (feePerJuror < 0n) {
      this.error("--fee-per-juror must be non-negative", { exit: 1 });
    }

    const cost = appealCost(flags["current-round"], feePerJuror);
    if (!cost) {
      this.error(
        `Panel math overflow at --current-round ${flags["current-round"]} (ladder caps at round 31)`,
        { exit: 1 },
      );
    }

    this.emitRead(cost, {
      primary: cost.total.toString(),
      human: [
        `new round    : ${cost.newRound}`,
        `panel        : ${cost.panel} jurors`,
        `new-round fee: ${groupBigInt(cost.fee)}`,
        `bond         : ${groupBigInt(cost.bond)}  (== fee; forfeit if no flip, refund if flip)`,
        `total payable: ${groupBigInt(cost.total)}`,
      ],
    });
  }
}
