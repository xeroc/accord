/**
 * `useaccord dispute:required-fee` — pure (offline) computation of the round-1
 * `create_dispute` fee. SDK: `requiredFee` (methods/dispute.ts:113).
 *
 * The panel for round 1 is the fixed `INITIAL_NUM_JURORS` (=3), so the fee is
 * `3 · fee_per_juror`. No signer, no RPC — extends `BaseCommand`. Matches the
 * value `dispute:create --fee auto` computes on-chain.
 */
import { Flags } from "@oclif/core";

import { requiredFee } from "@useaccord/sdk";

import { BaseCommand, accordBaseFlags } from "../../lib/base-command.js";
import { groupBigInt } from "../../lib/format.js";

export default class DisputeRequiredFee extends BaseCommand {
  static summary = "Compute the round-1 create_dispute fee (pure; 3 × fee-per-juror)";

  static description =
    "Print the total fee a filer must deposit to file a dispute, given a " +
    "Subaccord's per-juror fee. Pure arithmetic — no chain access. Matches " +
    "`dispute:create --fee auto`. Errors on u64 overflow.";

  static examples = [
    "<%= config.bin %> dispute:required-fee --fee-per-juror 1_000_000",
    "<%= config.bin %> dispute:required-fee --fee-per-juror 5000000 --json",
  ];

  static flags = {
    ...accordBaseFlags,
    "fee-per-juror": Flags.string({
      description: "Per-juror fee in lamports (the Subaccord's feePerJuror)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DisputeRequiredFee);
    this.applyOutput(flags);

    const feePerJuror = parseLamports(flags["fee-per-juror"], "fee-per-juror");
    const fee = requiredFee(feePerJuror);
    if (fee === null) {
      throw new Error(`FeeOverflow: 3 × ${feePerJuror} exceeds u64; lower the per-juror fee`);
    }

    this.emitRead(
      { feePerJuror, fee },
      {
        primary: fee.toString(),
        human: [
          `fee-per-juror : ${groupBigInt(feePerJuror)} lamports`,
          `fee          : ${groupBigInt(fee)} lamports`,
        ],
      },
    );
  }
}

/**
 * Parse a lamports amount accepting digit groups (`1_000_000`) or a bare integer.
 * Negative values are rejected. Returns bigint.
 */
export function parseLamports(raw: string, flag: string): bigint {
  const cleaned = raw.replace(/_/g, "");
  if (!/^\d+$/.test(cleaned)) {
    throw new Error(`Invalid${flag}: expected a non-negative integer (lamports), got "${raw}"`);
  }
  return BigInt(cleaned);
}
