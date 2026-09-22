/**
 * `useaccord dispute:claim-filing-bounty` — sweep the flip-bounty pool back to
 * the filer when a dispute finalized WITHOUT ever being appealed (ADR-0030).
 * SDK: `methods.claimFilingBounty` (methods/settlement.ts → lib.rs).
 *
 * The filer's filing-time `+1 · fee_per_juror` unit sits on
 * `Dispute.bounty_pool` while `current_round == 0` at `Final`; this
 * permissionless crank pays it vault → filer ATA. Every other terminal shape
 * disposes of the pool elsewhere (finalize_dispute / the Failed transitions)
 * and is rejected here. Idempotent on-chain: the pool is zeroed on payout.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { fetchMaybeDispute, fetchMaybeSubaccord, findAssociatedTokenAddress } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class DisputeClaimFilingBounty extends ChainCommand {
  static summary = "Sweep the un-appealed filing bounty back to the filer (permissionless crank)";

  static description =
    "Claim the flip-bounty refund (ADR-0030) on a dispute that finalized " +
    "without ever being appealed. The filer's filing-time " +
    "`+1 · fee_per_juror` unit is paid from the Subaccord fee vault to the " +
    "filer's feeToken ATA. Rejected when any appeal happened (the pool was " +
    "disposed at `finalize_dispute`) or on the Failed path (the unit rode the " +
    "filer's cancel/redraw refund). Idempotent — re-running after payout is a " +
    "no-op.";

  static examples = [
    "<%= config.bin %> dispute:claim-filing-bounty --dispute 9aJb2…",
    "<%= config.bin %> dispute:claim-filing-bounty --dispute 9aJb2… --filer-token-account 7VtW…",
  ];

  static flags = {
    ...chainFlags,
    dispute: Flags.string({
      description: "The Final, never-appealed Dispute PDA whose bounty to claim",
      required: true,
    }),
    "filer-token-account": Flags.string({
      description: "Filer's feeToken ATA (sweep destination); defaults to the loaded wallet's ATA",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DisputeClaimFilingBounty);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const dispute = flags.dispute as Address;

    const disputeAcct = await fetchMaybeDispute(ctx.accord.rpc, dispute);
    if (!disputeAcct.exists) {
      this.error(`Dispute not found: ${dispute}`, { exit: 1 });
    }
    const { subaccord, filer } = disputeAcct.data;

    const subAcct = await fetchMaybeSubaccord(ctx.accord.rpc, subaccord);
    if (!subAcct.exists) {
      this.error(`Subaccord not found: ${subaccord}`, { exit: 1 });
    }
    const feeToken = subAcct.data.feeToken;

    const feeVault = await findAssociatedTokenAddress(feeToken, subaccord);
    const filerTokenAccount =
      (flags["filer-token-account"] as Address | undefined) ??
      (await findAssociatedTokenAddress(feeToken, filer));

    const instruction = ctx.accord.methods.claimFilingBounty({
      caller: ctx.signer.address,
      subaccord,
      dispute,
      feeToken,
      filerTokenAccount,
      feeVault,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { dispute, filer });
  }
}
