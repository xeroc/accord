/**
 * `useaccord staking:can-unstake` — pure unstake pre-check. SDK: `canUnstake`
 * (staking.ts:57).
 *
 * Offline: runs the same three on-chain requires (`amount > 0`,
 * `active_draws == 0`, `amount ≤ staked`) against caller-supplied stake fields
 * and prints `{ canUnstake, activeDraws, reason }`. No chain access, no send.
 * Pipe live data from `read:juror-stake`, or script with known values.
 */
import { Flags } from "@oclif/core";
import type { Address } from "@solana/kit";

import { canUnstake } from "@useaccord/sdk";

import { BaseCommand, accordBaseFlags } from "../../lib/base-command.js";

// canUnstake never reads `juror` / `feesEarned`; they're required by the view
// type but irrelevant to the guard. Defaulted here to keep the CLI input minimal.
const UNUSED_ADDRESS = "" as Address;

export default class StakingCanUnstake extends BaseCommand {
  static summary = "Pure pre-check: would an unstake of --amount succeed?";

  static description =
    "Run the unstake guard offline (no chain, no send). Mirrors the on-chain " +
    "requires: amount > 0, active_draws == 0, amount ≤ staked. Prints " +
    "{ canUnstake, activeDraws, reason }. Useful before `staking:withdraw`.";

  static examples = [
    "<%= config.bin %> staking:can-unstake --staked 1000 --active-draws 0 --amount 500",
    "<%= config.bin %> staking:can-unstake --staked 1000 --active-draws 2 --amount 500",
  ];

  static flags = {
    ...accordBaseFlags,
    staked: Flags.string({
      description: "JurorStake.staked (u64, raw units)",
      required: true,
    }),
    "active-draws": Flags.integer({
      description: "JurorStake.active_draws (disputes this juror is drawn into)",
      required: true,
    }),
    amount: Flags.string({
      description: "Proposed unstake amount (u64, raw units)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingCanUnstake);
    this.applyOutput(flags);

    const staked = BigInt(flags.staked);
    const amount = BigInt(flags.amount);
    const guard = canUnstake(
      {
        juror: UNUSED_ADDRESS,
        staked,
        feesEarned: 0n,
        activeDraws: flags["active-draws"],
      },
      amount,
    );

    const result = {
      canUnstake: guard.ok,
      activeDraws: flags["active-draws"],
      ...(guard.reason ? { reason: guard.reason } : {}),
    };

    this.emitRead(result, {
      primary: String(guard.ok),
      human: [
        `canUnstake : ${guard.ok ? "yes" : "no"}`,
        `activeDraws: ${flags["active-draws"]}`,
        ...(guard.reason ? [`reason     : ${guard.reason}`] : []),
      ],
    });
  }
}
