/**
 * `useaccord canon:settle` — fold a finished challenge's ruling back into the
 * item (canon `settle_item`). SDK: `@useaccord/canon` `settleItem`.
 *
 * Permissionless crank, run once the item's Accord dispute is Final: `keep` ⇒
 * the forfeited challenge_stake folds into accumulated_stake (progressive
 * protection); `remove` ⇒ the challenger takes the pot as bounty. Every payee
 * comes from on-chain state — the dispute, challenger, and submitter are read
 * off the CanonItem, so payouts cannot be redirected.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { findAssociatedTokenAddress } from "@useaccord/sdk";
import { settleItem } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolveItem } from "../../canon-context.js";

export default class CanonSettle extends ChainCommand {
  static summary = "Crank a finished challenge's ruling into the item (keep/remove)";

  static description =
    "Permissionless crank over a Disputed item whose Accord dispute reached " +
    "Final. keep ⇒ item flips to Listed and the forfeited challenge stake folds " +
    "into accumulated_stake; remove ⇒ item flips to Removed and the challenger " +
    "takes the accumulated stake as bounty. The dispute + payees are read from " +
    "the CanonItem — no addresses are taken from flags.";

  static examples = ["<%= config.bin %> canon:settle --item <pda>"];

  static flags = {
    ...chainFlags,
    item: Flags.string({ description: "CanonItem PDA address", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonSettle);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const r = await resolveItem(ctx, flags.item as Address);
    const { item, itemAddress, listAddress, list } = r;

    const vault = await findAssociatedTokenAddress(list.feeMint, listAddress);
    const challengerTokenAccount = await findAssociatedTokenAddress(list.feeMint, item.challenger);
    const submitterTokenAccount = await findAssociatedTokenAddress(list.feeMint, item.submitter);

    const instruction = settleItem({
      caller: ctx.signer,
      list: listAddress,
      item: itemAddress,
      dispute: item.activeDispute,
      feeMint: list.feeMint,
      vault,
      challengerTokenAccount,
      submitterTokenAccount,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { item: itemAddress, dispute: item.activeDispute });
  }
}
