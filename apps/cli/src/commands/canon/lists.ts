/**
 * `useaccord canon:lists` — list every CanonList on the program.
 * SDK: `@useaccord/canon` `findAllCanonLists`.
 */
import { findAllCanonLists } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitListRead, outFlag } from "../../read-io.js";

export default class CanonReadLists extends ChainCommand {
  static summary = "List every CanonList on the program";

  static description =
    "Bulk CanonList query (discriminator-only getProgramAccounts). Returns " +
    "every list with its creator, mints, and economics.";

  static examples = ["<%= config.bin %> canon:lists", "<%= config.bin %> canon:lists --json"];

  static flags = { ...chainFlags, out: outFlag };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonReadLists);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const accounts = await findAllCanonLists(ctx.accord.rpc);
    emitListRead(this.emitRead.bind(this), flags, accounts, "canon lists");
  }
}
