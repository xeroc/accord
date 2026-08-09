/**
 * `useaccord read:appeal-bond --dispute <addr> --round-idx <n>` — derive the
 * AppealBond PDA for (dispute, round_idx) and decode it.
 * SDK: `findAppealBondPda` + `fetchMaybeAppealBond`. Missing ⇒ `{exists:false}`,
 * exit 0 (no appeal filed for that round yet).
 */
import { Flags } from "@oclif/core";

import { type Address } from "@solana/kit";

import { fetchMaybeAppealBond, findAppealBondPda } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { emitAccountRead, outFlag } from "../../read-io.js";

export default class ReadAppealBond extends ChainCommand {
  static summary = "Fetch + decode an AppealBond (derived from dispute + round)";

  static description =
    "Derive the AppealBond PDA from --dispute + --round-idx and decode it. " +
    "Shows the appellant, bond amount, and the prior round result being " +
    "appealed. Not yet posted ⇒ {exists:false} (no appeal for that round).";

  static examples = [
    "<%= config.bin %> read:appeal-bond --dispute <addr> --round-idx 0",
    "<%= config.bin %> read:appeal-bond --dispute <addr> --round-idx 1 --json",
  ];

  static flags = {
    ...chainFlags,
    out: outFlag,
    dispute: Flags.string({
      description: "Dispute account address",
      required: true,
    }),
    "round-idx": Flags.integer({
      description: "Round index the appeal bond is keyed by",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ReadAppealBond);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [bondPda] = await findAppealBondPda({
      dispute: flags.dispute as Address,
      roundIdx: flags["round-idx"],
    });
    const maybe = await fetchMaybeAppealBond(ctx.accord.rpc, bondPda);
    emitAccountRead(this.emitRead.bind(this), flags, maybe, "appealBond");
  }
}
