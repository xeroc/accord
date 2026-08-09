/**
 * `useaccord lifecycle:execute-unpause` — permissionless crank that clears the
 * paused flag after the unpause timelock (lib.rs `execute_unpause`). SDK:
 * `methods.executeUnpause`.
 *
 * Anyone can call this once `UNPAUSE_TIMELOCK_SLOTS` (24h) has elapsed since
 * `propose_unpause` landed. The loaded `--keypair` is only the fee payer.
 */
import { Accord, findPauseStatePda } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class LifecycleExecuteUnpause extends ChainCommand {
  static summary = "Unpause the Accord (permissionless, post-timelock)";

  static description =
    "Permissionless crank that clears the paused flag. Callable by anyone once " +
    "UNPAUSE_TIMELOCK_SLOTS (24h) has elapsed since lifecycle:propose-unpause " +
    "landed. The loaded wallet is only the fee payer.";

  static examples = ["<%= config.bin %> lifecycle:execute-unpause"];

  static flags = { ...chainFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecycleExecuteUnpause);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [pauseState] = await findPauseStatePda({
      programAddress: Accord.PROGRAM_ID,
    });
    const instruction = ctx.accord.methods.executeUnpause(ctx.signer.address, pauseState);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { caller: ctx.signer.address, pauseState });
  }
}
