/**
 * `useaccord staking:withdraw` — phase 2 of the two-phase withdraw.
 * SDK: `methods.withdraw` (staking.ts:221).
 *
 * Moves the banked `pending_withdrawal` from the stake_vault back into the
 * juror's ATA. On-chain gates: `WITHDRAWAL_DELAY` elapsed since
 * `request_withdraw` AND `active_draws == 0`. No args; no path — reads
 * `pending_withdrawal` straight from `JurorStake`.
 */
import { Flags } from "@oclif/core";
import type { Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveStaking, stakingAccounts } from "../../staking-context.js";

export default class StakingWithdraw extends ChainCommand {
  static summary = "Withdraw banked collateral (phase 2 — moves tokens)";

  static description =
    "Move the banked pending_withdrawal from the stake_vault into the juror's " +
    "ATA. Requires WITHDRAWAL_DELAY elapsed since `staking:request-withdraw` " +
    "AND active_draws == 0. Pre-check with `staking:can-unstake`.";

  static examples = [
    "<%= config.bin %> staking:withdraw --subaccord 7vrF…",
    "<%= config.bin %> staking:withdraw --subcord 7vrF… --dry-run",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address",
      required: true,
    }),
    juror: Flags.string({
      description: "Staking juror (defaults to the loaded signer)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingWithdraw);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const juror = (flags.juror as Address | undefined) ?? ctx.signer.address;

    const r = await resolveStaking(ctx, flags.subaccord as Address, juror);
    const instruction = ctx.accord.methods.withdraw(stakingAccounts(r));

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      subaccord: r.subaccord,
      jurorStake: r.jurorStake,
    });
  }
}
