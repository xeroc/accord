/**
 * `useaccord canon:items` — list every CanonItem on the program.
 * SDK: `@useaccord/canon` `findAllCanonItems`.
 */
import { findAllCanonItems } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitListRead, outFlag } from "../../read-io.js";

export default class CanonReadItems extends ChainCommand {
  static summary = "List every CanonItem on the program";

  static description =
    "Bulk CanonItem query (discriminator-only getProgramAccounts). Returns " +
    "every item with its list back-ref, submitter, state, and stake. Filter " +
    "client-side with `--json | jq` (e.g. by `.data.list`).";

  static examples = ["<%= config.bin %> canon:items", "<%= config.bin %> canon:items --json"];

  static flags = { ...chainFlags, out: outFlag };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonReadItems);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const accounts = await findAllCanonItems(ctx.accord.rpc);
    emitListRead(this.emitRead.bind(this), flags, accounts, "canon items");
  }
}
