/**
 * `useaccord read:pause-state` — fetch + decode the AccordState singleton PDA.
 * SDK: `fetchMaybeAccordState` (derives the canonical singleton; no address arg).
 * Missing ⇒ `{exists:false}` (init-pause has not run), exit 0.
 */
import { findAccordStatePda, fetchMaybeAccordState } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadAccordState extends ChainCommand {
  static summary = "Fetch + decode the AccordState singleton";

  static description =
    "Read the program-wide AccordState singleton (one per deployment). Decodes " +
    "the pause authority, paused flag, and any armed unpause slot. Not yet " +
    "initialized ⇒ {exists:false} (run lifecycle:init-pause).";

  static examples = [
    "<%= config.bin %> read:pause-state",
    "<%= config.bin %> read:pause-state --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadAccordState);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [accordState] = await findAccordStatePda();
    const maybe = await fetchMaybeAccordState(ctx.accord.rpc, accordState);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "accordState");
  }
}
