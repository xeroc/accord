/**
 * `useaccord canon:request-withdrawal` — submitter-initiated delist request
 * (canon `request_withdrawal`). SDK: `@useaccord/canon` `requestWithdrawal`.
 *
 * The loaded wallet must be the item's submitter. Flips a Listed item to
 * WithdrawPending and opens the withdrawal_timelock fraud-challenge window;
 * `canon:advance-withdrawal` completes it once the window elapses unchallenged.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { requestWithdrawal } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveItem } from "../../canon-context.js";

export default class CanonRequestWithdrawal extends ChainCommand {
  static summary = "Request item withdrawal (submitter-only; opens the challenge window)";

  static description =
    "The item's submitter requests a delist-with-deposit-return. The item flips " +
    "to WithdrawPending for the list's withdrawal_timelock — a challenge in " +
    "that window re-enters the dispute path (the ruling then decides whether " +
    "the submitter keeps the deposit or forfeits it). Crank " +
    "`canon:advance-withdrawal` after the window to complete an uncontested " +
    "withdrawal. The loaded wallet must be the CanonItem submitter.";

  static examples = ["<%= config.bin %> canon:request-withdrawal --item <pda>"];

  static flags = {
    ...chainFlags,
    item: Flags.string({ description: "CanonItem PDA address", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonRequestWithdrawal);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const r = await resolveItem(ctx, flags.item as Address);

    const instruction = requestWithdrawal({
      submitter: ctx.signer,
      list: r.listAddress,
      item: r.itemAddress,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { item: r.itemAddress, state: "WithdrawPending" });
  }
}
