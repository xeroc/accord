/**
 * `useaccord read:subaccords` — list every Subaccord on the program.
 * SDK: `findAllSubaccords`.
 */
import { findAllSubaccords } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitListRead, outFlag } from "../../read-io.js";

export default class ReadSubaccords extends ChainCommand {
  static summary = "List every Subaccord on the program";

  static description =
    "Bulk Subaccord query (discriminator-only getProgramAccounts). Returns " +
    "every Subaccord with its creator, staking/fee mints, and economics.";

  static examples = [
    "<%= config.bin %> read:subaccords",
    "<%= config.bin %> read:subaccords --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadSubaccords);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const accounts = await findAllSubaccords(ctx.accord.rpc);
    emitListRead(this.emitRead.bind(this), flags, accounts, "subaccords");
  }
}
