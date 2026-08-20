/**
 * `useaccord canon:advance-pending` — crank an unchallenged Pending item to
 * Listed (canon `advance_pending`). SDK: `@useaccord/canon` `advancePending`.
 *
 * Permissionless: anyone can crank once `listing_window` has elapsed since the
 * item's `submitted_at`. The list address is read from the item's back-ref.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { advancePending } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveItem } from "../../canon-context.js";

export default class CanonAdvancePending extends ChainCommand {
  static summary = "Crank a Pending item to Listed (listing window elapsed)";

  static description =
    "Permissionless crank: promote a CanonItem from Pending to Listed once the " +
    "list's listing_window has elapsed since submission without a challenge. " +
    "On-chain rejects it early (ListingWindowOpen).";

  static examples = ["<%= config.bin %> canon:advance-pending --item <pda>"];

  static flags = {
    ...chainFlags,
    item: Flags.string({ description: "CanonItem PDA address", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonAdvancePending);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const r = await resolveItem(ctx, flags.item as Address);

    const instruction = advancePending({
      caller: ctx.signer,
      list: r.listAddress,
      item: r.itemAddress,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { item: r.itemAddress, state: "Listed" });
  }
}
