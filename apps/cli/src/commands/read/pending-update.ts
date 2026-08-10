/**
 * `useaccord read:pending-update <addr>` — fetch + decode a PendingUpdate account.
 * SDK: `fetchMaybePendingUpdate`. Missing ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybePendingUpdate } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadPendingUpdate extends ChainCommand {
  static summary = "Fetch + decode a PendingUpdate account";

  static description =
    "Read a PendingUpdate by address. Decodes the proposed UpdatePayload, " +
    "proposer, and the timelock execute-after slot. Missing account returns " +
    "{exists:false} (exit 0).";

  static examples = [
    "<%= config.bin %> read:pending-update <addr>",
    "<%= config.bin %> read:pending-update <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({ description: "PendingUpdate account address", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(ReadPendingUpdate);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybePendingUpdate(ctx.accord.rpc, args.address as Address);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "pendingUpdate");
  }
}
