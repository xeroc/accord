/**
 * `useaccord appeal:claim-refund` — sweep a flipped appeal bond back to its
 * appellant after `finalize_dispute`. SDK: `methods.claimAppealRefund`
 * (methods/appeal.ts:193 → lib.rs:1481).
 *
 * Permissionless crank, but the refund lands in the original appellant's
 * `feeToken` ATA (owner checked on-chain). `--round-idx` selects the appeal
 * (the round that was appealed, i.e. the AppealBond PDA seed). The loaded
 * wallet is the caller; `--claimant-token-account` defaults to the wallet's
 * `feeToken` ATA (the single-signer model — the appellant reclaims their own
 * bond).
 *
 * Idempotent on-chain: the bond is zeroed on payout, so re-invocation is a
 * no-op.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import {
  fetchMaybeDispute,
  fetchMaybeSubaccord,
  findAppealBondPda,
  findAssociatedTokenAddress,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class AppealClaimRefund extends ChainCommand {
  static summary = "Sweep a flipped appeal bond back to its appellant (permissionless crank)";

  static description =
    "Claim an appeal bond refund after `finalize_dispute` returns it (appeal " +
    "flipped the prior ruling). `--round-idx` is the round that was appealed " +
    "(the AppealBond PDA seed). The refund goes to the appellant's `feeToken` " +
    "ATA; by default the loaded wallet's ATA (single-signer model). " +
    "Idempotent — re-running after payout is a no-op.";

  static examples = [
    "<%= config.bin %> appeal:claim-refund --dispute 9aJb2… --round-idx 0",
    "<%= config.bin %> appeal:claim-refund --dispute 9aJb2… --round-idx 1 --claimant-token-account 7VtW…",
  ];

  static flags = {
    ...chainFlags,
    dispute: Flags.string({
      description: "The Dispute PDA whose appeal bond to claim",
      required: true,
    }),
    "round-idx": Flags.integer({
      description: "The round index that was appealed (AppealBond PDA seed)",
      required: true,
    }),
    "claimant-token-account": Flags.string({
      description:
        "Appellant's feeToken ATA (refund destination); defaults to the loaded wallet's ATA",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppealClaimRefund);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const dispute = flags.dispute as Address;
    const roundIdx = flags["round-idx"];

    const disputeAcct = await fetchMaybeDispute(ctx.accord.rpc, dispute);
    if (!disputeAcct.exists) {
      this.error(`Dispute not found: ${dispute}`, { exit: 1 });
    }
    const { subaccord } = disputeAcct.data;

    const subAcct = await fetchMaybeSubaccord(ctx.accord.rpc, subaccord);
    if (!subAcct.exists) {
      this.error(`Subaccord not found: ${subaccord}`, { exit: 1 });
    }
    const feeToken = subAcct.data.feeToken;

    const [appealBond] = await findAppealBondPda({ dispute, roundIdx });
    const feeVault = await findAssociatedTokenAddress(feeToken, subaccord);
    const claimantTokenAccount =
      (flags["claimant-token-account"] as Address | undefined) ??
      (await findAssociatedTokenAddress(feeToken, ctx.signer.address));

    const instruction = ctx.accord.methods.claimAppealRefund(
      {
        caller: ctx.signer.address,
        subaccord,
        dispute,
        appealBond,
        feeToken,
        claimantTokenAccount,
        feeVault,
      },
      roundIdx,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { appealBond, roundIdx });
  }
}
