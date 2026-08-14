/**
 * `useaccord lifecycle:propose-unpause` — arms the unpause timelock
 * (lib.rs `propose_unpause`). SDK: `methods.proposeUnpause`.
 *
 * The loaded `--keypair` wallet must be the pause authority. Arms
 * `UNPAUSE_TIMELOCK_SLOTS` (24h) of notice before `execute-unpause` can land.
 */
import { Accord, findAccordStatePda, UNPAUSE_TIMELOCK_SLOTS } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class LifecycleProposeUnpause extends ChainCommand {
  static summary = "Arm the unpause timelock (pause-authority only)";

  static description =
    "Begin the unpause process: arms UNPAUSE_TIMELOCK_SLOTS (24h) of notice before " +
    "lifecycle:execute-unpause can land. Only the pause authority may call this. " +
    "The AccordState PDA is derived from the canonical program id (singleton).";

  static examples = ["<%= config.bin %> lifecycle:propose-unpause"];

  static flags = { ...chainFlags };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecycleProposeUnpause);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [accordState] = await findAccordStatePda({
      programAddress: Accord.PROGRAM_ID,
    });
    const instruction = ctx.accord.methods.proposeUnpause(ctx.signer.address, accordState);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, {
      authority: ctx.signer.address,
      accordState,
      unpauseTimelockSlots: UNPAUSE_TIMELOCK_SLOTS,
    });
  }
}
