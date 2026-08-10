/**
 * `useaccord lifecycle:init-pause` — one-time initialization of the PauseState
 * singleton (lib.rs `initialize_pause`). SDK: `methods.initializePause`.
 *
 * The loaded `--keypair` wallet is the fee payer AND becomes the on-chain pause
 * authority (the adapter hard-wires `authority: accord.signer`). Must run once
 * per program deployment before `pause`/`propose_unpause` are usable.
 *
 * `--skip-if-exists` makes it idempotent: if PauseState is already initialized,
 * the command reports the existing authority and exits 0 without sending.
 */
import { Flags } from "@oclif/core";

import { fetchMaybePauseState } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class LifecycleInitPause extends ChainCommand {
  static summary = "Initialize the Accord PauseState singleton (one-time)";

  static description =
    "Initialize the PauseState singleton PDA, recording the wallet as the pause " +
    "authority. Must be called exactly once per program deployment, before any " +
    "pause / unpause operation. Permissionless to call, but the caller becomes " +
    "the pause authority.";

  static examples = [
    "<%= config.bin %> lifecycle:init-pause",
    "<%= config.bin %> lifecycle:init-pause --skip-if-exists",
  ];

  static flags = {
    ...chainFlags,
    "skip-if-exists": Flags.boolean({
      description: "Exit 0 without sending if PauseState is already initialized",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LifecycleInitPause);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const { instruction, pauseState } = await ctx.accord.methods.initializePause(
      ctx.signer.address,
    );

    if (flags["skip-if-exists"]) {
      const existing = await fetchMaybePauseState(ctx.accord.rpc, pauseState);
      if (existing.exists) {
        this.emitRead(
          { pauseState, initialized: true, skipped: true },
          {
            primary: pauseState,
            human: [
              `PauseState already initialized: ${pauseState}`,
              "  (skipped — no transaction sent)",
            ],
          },
        );
        return;
      }
    }

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { authority: ctx.signer.address, pauseState });
  }
}
