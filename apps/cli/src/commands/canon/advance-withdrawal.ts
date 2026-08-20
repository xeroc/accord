/**
 * `useaccord canon:advance-withdrawal` — complete an uncontested withdrawal
 * (canon `advance_withdrawal`). SDK: `@useaccord/canon` `advanceWithdrawal`.
 *
 * Permissionless crank, eligible once the list's withdrawal_timelock has
 * elapsed since `request_withdrawal` without a challenge: returns the item's
 * accumulated_stake (fee_mint) from the list vault to the submitter's ATA and
 * flips the item to Removed.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { findAssociatedTokenAddress } from "@useaccord/sdk";
import { advanceWithdrawal } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveItem } from "../../canon-context.js";

export default class CanonAdvanceWithdrawal extends ChainCommand {
  static summary = "Crank an uncontested withdrawal (returns the stake; item → Removed)";

  static description =
    "Permissionless crank over a WithdrawPending item whose withdrawal_timelock " +
    "has elapsed without a challenge. Returns the accumulated_stake from the " +
    "list vault to the item submitter's ATA (read off the item — the payee " +
    "cannot be redirected) and flips the item to Removed. On-chain rejects it " +
    "early (WithdrawalTimelockOpen).";

  static examples = ["<%= config.bin %> canon:advance-withdrawal --item <pda>"];

  static flags = {
    ...chainFlags,
    item: Flags.string({ description: "CanonItem PDA address", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonAdvanceWithdrawal);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const r = await resolveItem(ctx, flags.item as Address);
    const { item, itemAddress, listAddress, list } = r;

    const submitterTokenAccount = await findAssociatedTokenAddress(list.feeMint, item.submitter);
    const vault = await findAssociatedTokenAddress(list.feeMint, listAddress);

    const instruction = advanceWithdrawal({
      caller: ctx.signer,
      list: listAddress,
      item: itemAddress,
      feeMint: list.feeMint,
      submitterTokenAccount,
      vault,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      item: itemAddress,
      returnedTo: item.submitter,
      amount: item.accumulatedStake,
    });
  }
}
