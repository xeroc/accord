/**
 * `useaccord lifecycle:pause` — instant, authority-gated emergency freeze
 * (lib.rs `pause`). SDK: `methods.pause`.
 *
 * The loaded `--keypair` wallet must be the recorded pause authority (set by
 * `lifecycle:init-pause`). The PauseState PDA is derived from the canonical
 * program id (singleton).
 */
import { Accord, findPauseStatePda } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class LifecyclePause extends ChainCommand {
  static summary = "Pause the Accord instantly (pause-authority only)";

  static description =
    "Instant emergency freeze of the whole Accord program. Only the recorded " +
    "pause authority (the wallet that ran lifecycle:init-pause, or its " +
    "delegated successor) may call this. While paused, staking/draws/votes are " +
    "blocked; unpause goes through propose-unpause → execute-unpause.";

  static examples = ["<%= config.bin %> lifecycle:pause"];

  static flags = { ...chainFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecyclePause);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [pauseState] = await findPauseStatePda({
      programAddress: Accord.PROGRAM_ID,
    });
    const instruction = ctx.accord.methods.pause(ctx.signer.address, pauseState);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { authority: ctx.signer.address, pauseState });
  }
}
