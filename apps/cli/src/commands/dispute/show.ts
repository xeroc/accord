/**
 * `useaccord dispute:show <dispute-pda>` — operator view of a Dispute's full
 * on-chain state. Fetches via the SDK's raw `fetchMaybeDispute` and renders
 * through `lib/dispute-view.ts` (sentinels interpreted, ISO timestamps,
 * grouped amounts). The interpreted companion to `read:dispute`'s raw dump;
 * missing account ⇒ `{exists:false}` exit 0 (read:dispute's contract).
 */
import { Args } from "@oclif/core";
import type { Address } from "@solana/kit";

import { fetchMaybeDispute } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { disputeView, renderDisputeHuman } from "../../lib/dispute-view.js";
import { outFlag, writeOut } from "../../read-io.js";

export default class DisputeShow extends ChainCommand {
  static summary = "Show all on-chain details of a dispute";

  static description =
    "Fetch a Dispute and render its complete interpreted state: lifecycle " +
    "state, round + drawn seats, options + per-round evidence hashes, frozen " +
    "VRF + accumulator root, fee economics, the frozen CaseTerms snapshot, " +
    "and the final ruling (null until Final). Read-only — sends nothing.";

  static examples = [
    "<%= config.bin %> dispute:show <dispute-pda>",
    "<%= config.bin %> dispute:show <dispute-pda> --json",
  ];

  static flags = { ...chainFlags, out: outFlag };

  static args = {
    dispute: Args.string({ description: "Dispute PDA to show", required: true }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(DisputeShow);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const maybe = await fetchMaybeDispute(ctx.accord.rpc, args.dispute as Address);

    if (!maybe.exists) {
      this.emitRead(
        { dispute: args.dispute, exists: false },
        { human: [`dispute : ${args.dispute}`, "not found"] },
      );
      return;
    }

    const view = disputeView(maybe.data);
    const payload = { dispute: args.dispute, exists: true, ...view };
    if (flags.out) writeOut(flags.out, payload);

    this.emitRead(payload, {
      primary: view.state,
      human: [`dispute        : ${args.dispute}`, ...renderDisputeHuman(view)],
    });
  }
}
