/**
 * `useaccord read:pause-state` — fetch + decode the PauseState singleton PDA.
 * SDK: `fetchMaybePauseState` (derives the canonical singleton; no address arg).
 * Missing ⇒ `{exists:false}` (init-pause has not run), exit 0.
 */
import { findPauseStatePda, fetchMaybePauseState } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadPauseState extends ChainCommand {
  static summary = "Fetch + decode the PauseState singleton";

  static description =
    "Read the program-wide PauseState singleton (one per deployment). Decodes " +
    "the pause authority, paused flag, and any armed unpause slot. Not yet " +
    "initialized ⇒ {exists:false} (run lifecycle:init-pause).";

  static examples = [
    "<%= config.bin %> read:pause-state",
    "<%= config.bin %> read:pause-state --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadPauseState);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [pauseState] = await findPauseStatePda();
    const maybe = await fetchMaybePauseState(ctx.accord.rpc, pauseState);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "pauseState");
  }
}
