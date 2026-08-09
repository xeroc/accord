/**
 * `useaccord appeal:open` — open the next appeal round on a resolved dispute.
 * SDK: `methods.appeal` (methods/appeal.ts:179 → lib.rs:1374).
 *
 * Permissionless: the loaded `--keypair` wallet is the appellant (overridable
 * via `--appellant`) and pays `fee_new + bond` for round `current_round + 1`,
 * resetting the dispute to `Created` with a `2N+1` panel.
 *
 * Account derivation (lazy ponytail — `--dispute` is the only required
 * address; everything else is derived):
 *   - pauseState  : singleton PDA `["pause"]`
 *   - round       : prior round PDA `["round", dispute, current_round]`
 *   - appealBond  : `["bond", dispute, current_round]` — keyed by the round
 *                   BEING appealed (before the increment). lib.rs:3361 seeds
 *                   with `dispute.current_round`; the green e2e matches. (The
 *                   SDK appeal.ts docstring saying `current_round+1` is stale.)
 *   - feeToken    : read off the Subaccord
 *   - appellantTokenAccount / feeVault : derived ATAs of feeToken
 */
import { Flags } from "@oclif/core";
import { getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";

import {
  Accord,
  fetchMaybeDispute,
  fetchMaybeSubaccord,
  findAppealBondPda,
  findPauseStatePda,
  findRoundPda,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

// Well-known SPL addresses (not exported by @solana/kit v7).
const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address;
const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" as Address;

/** Derive the associated token account (ATA) for `owner` under `mint`. */
async function ataOf(mint: Address, owner: Address): Promise<Address> {
  const enc = getAddressEncoder();
  const [addr] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [enc.encode(owner), enc.encode(TOKEN_PROGRAM_ADDRESS), enc.encode(mint)],
  });
  return addr;
}

export default class AppealOpen extends ChainCommand {
  static summary = "Open the next appeal round on a resolved dispute (permissionless)";

  static description =
    "File an appeal from a Subaccord dispute's current round. The appellant " +
    "pays the new round's fee plus an equal bond (see `appeal:cost`), opening " +
    "round `current_round + 1` at a 2N+1 panel and resetting the dispute to " +
    "Created. Only the dispute address is required; the prior round, " +
    "AppealBond, fee token, and token accounts are all derived. The dispute " +
    "must be in the RoundResolved state within its appeal window.";

  static examples = [
    "<%= config.bin %> appeal:open --dispute 9aJb2…",
    "<%= config.bin %> appeal:open --dispute 9aJb2… --appellant 4Hpge… --dry-run",
  ];

  static flags = {
    ...chainFlags,
    dispute: Flags.string({
      description: "The Dispute PDA to appeal",
      required: true,
    }),
    appellant: Flags.string({
      description: "Appellant address (defaults to the loaded wallet)",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppealOpen);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const appellant = (flags.appellant as Address | undefined) ?? ctx.signer.address;
    const dispute = flags.dispute as Address;

    const disputeAcct = await fetchMaybeDispute(ctx.accord.rpc, dispute);
    if (!disputeAcct.exists) {
      this.error(`Dispute not found: ${dispute}`, { exit: 1 });
    }
    const { subaccord, currentRound } = disputeAcct.data;

    const subAcct = await fetchMaybeSubaccord(ctx.accord.rpc, subaccord);
    if (!subAcct.exists) {
      this.error(`Subaccord not found: ${subaccord}`, { exit: 1 });
    }
    const feeToken = subAcct.data.feeToken;

    const [pauseState] = await findPauseStatePda({ programAddress: Accord.PROGRAM_ID });
    const [round] = await findRoundPda({ dispute, roundIdx: currentRound });
    // AppealBond is seeded by the round BEING appealed (currentRound, pre-increment).
    const [appealBond] = await findAppealBondPda({ dispute, roundIdx: currentRound });
    const appellantTokenAccount = await ataOf(feeToken, appellant);
    const feeVault = await ataOf(feeToken, subaccord);

    const instruction = ctx.accord.methods.appeal({
      appellant,
      subaccord,
      pauseState,
      dispute,
      round,
      appealBond,
      feeToken,
      appellantTokenAccount,
      feeVault,
    });

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { appealBond, newRound: currentRound + 1 });
  }
}
