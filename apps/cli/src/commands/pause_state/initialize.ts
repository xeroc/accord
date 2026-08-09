/**
 * `useaccord pause_state initialize` — one-time initialization of the Accord
 * PauseState singleton (lib.rs `initialize_pause`).
 *
 * The PauseState account is the circuit-breaker root: a single PDA (seeds
 * `["pause"]`) that records the pause authority. `initialize_pause` must run
 * once per program deployment before `pause`/`propose_unpause` are usable.
 *
 * The wallet loaded from `--wallet` / `$ANCHOR_WALLET` is the signer, fee
 * payer, and the on-chain pause authority (the adapter hard-wires
 * `authority: accord.signer`).
 */
import { Flags } from "@oclif/core";

import { Accord } from "@useaccord/sdk";

import { BaseCommand, accordFlags } from "../../lib/base-command.js";
import { defaultWsEndpoint, loadKeypair } from "../../lib/wallet.js";

export default class PauseStateInitialize extends BaseCommand {
  static summary = "Initialize the Accord PauseState singleton (one-time)";

  static description =
    "Initialize the PauseState singleton PDA, recording the wallet as the pause " +
    "authority. Must be called exactly once per program deployment, before any " +
    "pause / unpause operation is possible. Permissionless to call, but the " +
    "caller becomes the pause authority.";

  static examples = ["<%= config.bin %> pause_state initialize"];

  static flags = {
    ...accordFlags,
    "dry-run": Flags.boolean({
      description: "Build the instruction without sending a transaction.",
      summary: "Build only; do not send",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PauseStateInitialize);

    const signer = await loadKeypair(flags.wallet);
    const wsEndpoint = flags.ws ?? defaultWsEndpoint(flags.rpc);
    const accord = new Accord({ endpoint: flags.rpc, signer });

    const { instruction, pauseState } = await accord.methods.initializePause(signer.address);

    this.log(`authority : ${signer.address}`);
    this.log(`pauseState: ${pauseState}`);

    if (flags["dry-run"]) {
      this.log("\n[dry-run] instruction built; not sending.");
      return;
    }

    this.log("\nsending initialize_pause…");
    const signature = await this.sendInstruction(accord, instruction, wsEndpoint, signer);
    this.log(`✓ confirmed: ${signature}`);
  }
}
