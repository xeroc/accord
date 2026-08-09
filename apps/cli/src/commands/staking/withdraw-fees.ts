/**
 * `useaccord staking:withdraw-fees` — pull aggregate earned fees (ADR-0020).
 * SDK: `methods.withdrawFees` (staking.ts:272).
 *
 * Per-juror: pulls the aggregate `fees_earned` from the Subaccord's `fee_vault`
 * into the juror's `fee_token` ATA. No `active_draws` gate, no timelock —
 * earned fees are not at-risk capital. The fee_token + fee_vault are distinct
 * from the staking_token / stake_vault (ADR-0020 two-mint economics).
 */
import { Flags } from "@oclif/core";
import type { Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import {
  associatedTokenAddress,
  resolveStaking,
  type ResolvedStaking,
} from "../../staking-context.js";

export default class StakingWithdrawFees extends ChainCommand {
  static summary = "Withdraw accumulated juror fees (ADR-0020)";

  static description =
    "Pull the aggregate fees_earned from the Subaccord's fee_vault into the " +
    "juror's fee_token ATA. No active_draws gate, no timelock. The fee_token " +
    "is the Subaccord's compensation mint (ADR-0020), separate from collateral.";

  static examples = [
    "<%= config.bin %> staking:withdraw-fees --subaccord 7vrF…",
    "<%= config.bin %> staking:withdraw-fees --subaccord 7vrF… --juror 9aJb…",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA address",
      required: true,
    }),
    juror: Flags.string({
      description: "Juror whose fees to withdraw (defaults to the loaded signer)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(StakingWithdrawFees);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const juror = (flags.juror as Address | undefined) ?? ctx.signer.address;

    const r = await resolveStaking(ctx, flags.subaccord as Address, juror);
    const accounts = await withdrawFeesAccounts(r);

    const instruction = ctx.accord.methods.withdrawFees(accounts);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      subaccord: r.subaccord,
      jurorStake: r.jurorStake,
      feeToken: r.feeToken,
    });
  }
}

/** Derive the fee_token ATAs the withdraw_fees instruction needs. */
async function withdrawFeesAccounts(r: ResolvedStaking) {
  const jurorFeeTokenAccount = await associatedTokenAddress(r.feeToken, r.juror);
  const feeVault = await associatedTokenAddress(r.feeToken, r.subaccord);
  return {
    juror: r.juror,
    subaccord: r.subaccord,
    jurorStake: r.jurorStake,
    feeToken: r.feeToken,
    jurorFeeTokenAccount,
    feeVault,
  };
}
