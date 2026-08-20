/**
 * `useaccord canon:list <addr>` — fetch + decode a CanonList account.
 * SDK: `@useaccord/canon` `fetchMaybeCanonList`. Missing ⇒ `{exists:false}`, exit 0.
 */
import { Args } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeCanonList, type CanonList } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class CanonReadList extends ChainCommand {
  static summary = "Fetch + decode a CanonList account";

  static description =
    "Read a CanonList by address. Decodes creator, mints, immutable rules_hash " +
    "+ list_program, backing subaccord, economics (submit_deposit, " +
    "challenge_pct, windows), and the item/dispute counters. Missing account " +
    "returns {exists:false} (exit 0).";

  static examples = [
    "<%= config.bin %> canon:list <addr>",
    "<%= config.bin %> canon:list <addr> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    address: Args.string({ description: "CanonList account address", required: true }),
  };

  async run(): Promise<void> {
    const { flags, args } = await this.parse(CanonReadList);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeCanonList(ctx.accord.rpc, args.address as Address);
    // Name the ownership gate so a `1111…1111` list_program reads as "any"
    // instead of an opaque address (the raw field still prints above).
    const gateHuman = maybe.exists ? [listProgramLine(maybe.data)] : [];
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "canon list", gateHuman);
  }
}

/** Human summary of the item-ownership gate (`list_program` at creation). */
function listProgramLine(data: CanonList): string {
  const sentinel = "11111111111111111111111111111111";
  const value =
    data.listProgram === sentinel
      ? "any (ownership check disabled)"
      : `pdas owned by ${data.listProgram}`;
  return `  ${"gate".padEnd(18)}: ${value}`;
}
