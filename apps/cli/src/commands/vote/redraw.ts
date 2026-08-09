/**
 * `useaccord vote:redraw` — permissionless shortfall-redraw crank (ADR-0021).
 * SDK: `redraw` (voting.ts:318).
 *
 * Only callable from `RedrawEligible`: slashes no-shows, bumps
 * `round.draw_attempt` (orthogonal to `round_idx`), clears the round → `Created`
 * for a fresh same-size draw. On exhaustion (`draw_attempt + 1 ≥
 * max_draw_attempts`) the round → `Failed` and the filer is refunded from the
 * fee vault. `--fee-vault` is auto-derivable from `(fee-token, subaccord)`.
 *
 * Note: `redraw` is a pure orchestration fn (voting.ts:318) that is not bound
 * on `Accord.methods` — we invoke it through the facade's `adapter` directly.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import { Accord, findRoundPda, redraw, type RedrawAccounts } from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { deriveAta } from "./reveal.js";
import { splitAddressList } from "./finalize-round.js";

/** SPL Token program id (not exported by @solana/kit v7). */
const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;

export default class VoteRedraw extends ChainCommand {
  static summary = "Permissionless shortfall-redraw crank (ADR-0021)";

  static description =
    "Redraw a shortfall round: slashes no-shows, bumps draw_attempt (same panel " +
    "size, no appeal consumed), clears the round to Created. On exhaustion the " +
    "round becomes Failed and the filer is refunded. `--fee-vault` defaults to " +
    "the subaccord's ATA of the fee token.";

  static examples = [
    "<%= config.bin %> vote:redraw --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --fee-token EPjF… --filer-token-account 7vv…",
    '<%= config.bin %> vote:redraw --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --fee-token EPjF… --filer-token-account 7vv… --remaining-accounts "Js1,Js2"',
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({ description: "Subaccord PDA address", required: true }),
    dispute: Flags.string({ description: "Dispute PDA address", required: true }),
    "round-idx": Flags.integer({
      description: "Round index (u32) — the round PDA is derived from (dispute, round-idx)",
      required: true,
    }),
    "fee-token": Flags.string({
      description: "Fee mint (compensation token)",
      required: true,
    }),
    "filer-token-account": Flags.string({
      description: "Filer's ATA of the fee token (refund destination on exhaustion)",
      required: true,
    }),
    "fee-vault": Flags.string({
      description: "Subaccord fee-vault ATA of the fee token (default: auto-derived)",
    }),
    "remaining-accounts": Flags.string({
      description:
        "Comma-separated JurorStake PDAs for the shortfall round (required on the Fail branch)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoteRedraw);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [round] = await findRoundPda(
      { dispute: flags.dispute as Address, roundIdx: flags["round-idx"] },
      { programAddress: Accord.PROGRAM_ID },
    );

    const feeVault =
      (flags["fee-vault"] as Address | undefined) ??
      (await deriveAta(flags.subaccord as Address, flags["fee-token"] as Address));

    const remaining = flags["remaining-accounts"]
      ? splitAddressList(flags["remaining-accounts"])
      : [];

    const accounts: RedrawAccounts = {
      caller: ctx.signer.address,
      subaccord: flags.subaccord as Address,
      dispute: flags.dispute as Address,
      round,
      feeToken: flags["fee-token"] as Address,
      filerTokenAccount: flags["filer-token-account"] as Address,
      feeVault,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    };

    // `redraw` is a pure orchestration fn (voting.ts:318), not bound on
    // `Accord.methods` — invoke it through the facade adapter directly.
    const instruction = redraw(ctx.accord.adapter, Accord.PROGRAM_ID, accounts, remaining);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { round, drawAttemptBumped: true });
  }
}
