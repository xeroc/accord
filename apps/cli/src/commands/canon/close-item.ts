/**
 * `useaccord canon:close-item` — reclaim a Removed item's rent
 * (canon `close_item`). SDK: `@useaccord/canon` `closeItem`.
 *
 * Permissionless: closes a terminal (Removed) CanonItem PDA; the caller
 * receives its rent-exempt lamports. The PDA is self-seeded on-chain, so no
 * other accounts are needed.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { closeItem } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class CanonCloseItem extends ChainCommand {
  static summary = "Close a Removed CanonItem (caller reclaims its rent)";

  static description =
    "Permissionless cleanup: close a CanonItem that reached the terminal " +
    "Removed state (lost a remove ruling, or a completed withdrawal). The " +
    "caller receives the item account's rent-exempt lamports.";

  static examples = ["<%= config.bin %> canon:close-item --item <pda>"];

  static flags = {
    ...chainFlags,
    item: Flags.string({ description: "CanonItem PDA address (must be Removed)", required: true }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonCloseItem);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const instruction = closeItem({ caller: ctx.signer, item: flags.item as Address });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { item: flags.item });
  }
}
