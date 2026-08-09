/**
 * `useaccord lifecycle:execute-update` — permissionless crank that lands a
 * pending Subaccord update after its timelock (lib.rs `execute_subaccord_update`).
 * SDK: `methods.executeSubaccordUpdate`.
 *
 * Anyone can call this once `execute_after_slot` has elapsed (read it back from
 * `lifecycle:propose-update`'s output, or from the PendingUpdate account). The
 * loaded `--keypair` is only the fee payer / caller here.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class LifecycleExecuteUpdate extends ChainCommand {
  static summary = "Execute a pending Subaccord update (permissionless, post-timelock)";

  static description =
    "Permissionless crank that lands a pending Subaccord parameter update. " +
    "Callable by anyone once UPDATE_TIMELOCK_SLOTS (48h) has elapsed since the " +
    "matching propose-update landed. The loaded wallet is only the fee payer.";

  static examples = [
    "<%= config.bin %> lifecycle:execute-update --subaccord <pda> --pending-update <pda>",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({
      description: "Subaccord PDA the update applies to",
      required: true,
    }),
    "pending-update": Flags.string({
      description: "PendingUpdate PDA returned by lifecycle:propose-update",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecycleExecuteUpdate);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const instruction = ctx.accord.methods.executeSubaccordUpdate(
      ctx.signer.address,
      flags.subaccord as Address,
      flags["pending-update"] as Address,
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      subaccord: flags.subaccord,
      pendingUpdate: flags["pending-update"],
    });
  }
}
