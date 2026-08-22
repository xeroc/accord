/**
 * `useaccord canon:update` — authority-gated instant retune of list-level
 * economics (canon lib.rs `update_list`). SDK: `@useaccord/canon` `updateList`.
 *
 * The loaded wallet must equal `CanonList.authority` (the creator at
 * creation, rotatable via `--new-authority`). Each param flag defaults to
 * "keep current": the on-chain value is fetched and passed through, so a
 * retune only names what changes. Instant — no timelock (court params keep
 * the 48h Accord timelock via `canon:court-update`).
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { updateList } from "@useaccord/canon";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { requireCanonList } from "../../canon-context.js";
import { parseLamports } from "../dispute/required-fee.js";

export default class CanonUpdateList extends ChainCommand {
  static summary = "Retune list params (instant, list-authority-gated)";

  static description =
    "Update the CanonList's submit_deposit, challenge_pct, listing_window, " +
    "and/or withdrawal_timelock. Authority-gated (the creator at creation, " +
    "rotatable via --new-authority) and instant — no timelock. Omitted " +
    "flags keep their current on-chain value. Court (dispute-mechanism) " +
    "params are NOT set here — they ride the 48h Accord timelock via " +
    "canon:court-update.";

  static examples = [
    "<%= config.bin %> canon:update --list <pda> --submit-deposit 1000",
    "<%= config.bin %> canon:update --list <pda> --challenge-pct 2500 --listing-window 86400",
    "<%= config.bin %> canon:update --list <pda> --new-authority <pubkey>",
  ];

  static flags = {
    ...chainFlags,
    list: Flags.string({
      description: "CanonList PDA to retune",
      required: true,
    }),
    "submit-deposit": Flags.string({
      description: "New submit_deposit (base units). Default: keep current.",
    }),
    "challenge-pct": Flags.integer({
      description: "New challenge_pct in bps (<= 10000). Default: keep current.",
    }),
    "listing-window": Flags.string({
      description: "New listing_window in seconds. Default: keep current.",
    }),
    "withdrawal-timelock": Flags.string({
      description: "New withdrawal_timelock in seconds. Default: keep current.",
    }),
    "new-authority": Flags.string({
      description: "Rotate the list governance key to this wallet. Default: keep current.",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(CanonUpdateList);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const listAddress = flags.list as Address;
    const current = await requireCanonList(ctx, listAddress);

    const instruction = updateList(
      { authority: ctx.signer, list: listAddress },
      {
        submitDeposit: flags["submit-deposit"]
          ? parseLamports(flags["submit-deposit"], "SubmitDeposit")
          : current.submitDeposit,
        challengePct: flags["challenge-pct"] ?? current.challengePct,
        listingWindow: flags["listing-window"]
          ? parseLamports(flags["listing-window"], "ListingWindow")
          : current.listingWindow,
        withdrawalTimelock: flags["withdrawal-timelock"]
          ? parseLamports(flags["withdrawal-timelock"], "WithdrawalTimelock")
          : current.withdrawalTimelock,
        newAuthority: flags["new-authority"] as Address | undefined,
      },
    );

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { list: listAddress });
  }
}
