/**
 * `useaccord canon:item <addr>` — fetch + decode a CanonItem account.
 * SDK: `@useaccord/canon` `fetchMaybeCanonItem`. Missing ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeCanonItem, ItemState, type CanonItem } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class CanonReadItem extends ChainCommand {
  static summary = "Fetch + decode a CanonItem account";

  static description =
    "Read a CanonItem by address. Decodes lifecycle state, submitter, " +
    "accumulated stake, challenge history, and the live dispute/challenger " +
    "while Disputed. Missing account returns {exists:false} (exit 0).";

  static examples = [
    "<%= config.bin %> canon:item <addr>",
    "<%= config.bin %> canon:item <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({ description: "CanonItem account address", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(CanonReadItem);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeCanonItem(ctx.accord.rpc, args.address as Address);
    // Name the lifecycle stage — the raw enum tag is an opaque number.
    const gateHuman = maybe.exists ? [stateLine(maybe.data)] : [];
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "canon item", gateHuman);
  }
}

/** Human lifecycle label for the `ItemState` numeric enum (state.rs). */
function stateLine(data: CanonItem): string {
  const names: Record<number, string> = {
    [ItemState.Pending]: "Pending — inside the listing window",
    [ItemState.Listed]: "Listed — open to (re-)challenge",
    [ItemState.Removed]: "Removed — terminal (closeable via canon:close-item)",
    [ItemState.WithdrawPending]: "WithdrawPending — withdrawal challenge window open",
    [ItemState.Disputed]: "Disputed — live Accord keep-vs-remove dispute",
  };
  const label = names[data.state] ?? `unknown (${data.state})`;
  return `  ${"state".padEnd(18)}: ${label}`;
}
