/**
 * `useaccord vote:finalize-dispute` — permissionless crank: settle the final
 * round, slash incoherent jurors, redistribute, write `final_ruling`.
 * SDK: `finalizeDispute` (voting.ts:273).
 *
 * `remaining_accounts` = panel JurorStake PDAs + one AppealBond PDA per prior
 * appeal (roundIdx `0..current_round`). `--remaining-accounts auto` derives
 * both from the on-chain dispute + round; a comma-separated list passes them
 * through verbatim (panel first, then bonds).
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import {
  Accord,
  fetchMaybeDispute,
  findAppealBondPda,
  findRoundPda,
  type VotingAccounts,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";
import { resolvePanelJurorStakes, splitAddressList } from "./finalize-round.js";

export default class VoteFinalizeDispute extends ChainCommand {
  static summary = "Permissionless finalize-dispute crank (slash + redistribute + ruling)";

  static description =
    "Settle the final round after the appeal window elapses: slashes incoherent " +
    "jurors, redistributes the pool, decrements active_draws, writes " +
    "final_ruling. `--remaining-accounts auto` derives the panel JurorStake " +
    "PDAs + one AppealBond PDA per prior appeal (roundIdx 0..current_round); a " +
    "comma-separated list passes them through (panel first, then bonds).";

  static examples = [
    "<%= config.bin %> vote:finalize-dispute --subaccord 9aJb… --dispute 5xQ… --round-idx 0 --remaining-accounts auto",
    '<%= config.bin %> vote:finalize-dispute --subaccord 9aJb… --dispute 5xQ… --round-idx 2 --remaining-accounts "Js1,Js2,Js3,Bond0,Bond1"',
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({ description: "Subaccord PDA address", required: true }),
    dispute: Flags.string({ description: "Dispute PDA address", required: true }),
    "round-idx": Flags.integer({
      description: "Round index (u32) — the round PDA is derived from (dispute, round-idx)",
      required: true,
    }),
    "remaining-accounts": Flags.string({
      description:
        '"auto" (derive panel JurorStakes + AppealBonds) or a comma-separated list (panel first, then bonds)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoteFinalizeDispute);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [round] = await findRoundPda(
      { dispute: flags.dispute as Address, roundIdx: flags["round-idx"] },
      { programAddress: Accord.PROGRAM_ID },
    );

    const remaining = await resolveRemainingWithBonds(
      ctx,
      flags["remaining-accounts"],
      flags.subaccord as Address,
      flags.dispute as Address,
      round,
    );

    const accounts: VotingAccounts = {
      signer: ctx.signer.address,
      subaccord: flags.subaccord as Address,
      dispute: flags.dispute as Address,
      round,
    };

    const instruction = ctx.accord.methods.finalizeDispute(accounts, remaining);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { round, remainingCount: remaining.length });
  }
}

/**
 * Resolve `--remaining-accounts` for `finalize_dispute`: panel JurorStake PDAs
 * followed by one AppealBond PDA per prior appeal (roundIdx `0..current_round`).
 *
 * - `undefined`/empty → `[]` (valid only when the round is empty AND no appeals;
 *   on-chain will reject otherwise).
 * - `"auto"` → fetch round (panel) + dispute (current_round), derive both sets.
 * - otherwise → comma-separated addresses (caller-responsible ordering).
 */
async function resolveRemainingWithBonds(
  ctx: { accord: Accord; commitment?: string },
  flag: string | undefined,
  subaccord: Address,
  dispute: Address,
  round: Address,
): Promise<Address[]> {
  if (!flag) return [];
  if (flag === "auto") {
    const panel = await resolvePanelJurorStakes(ctx.accord, subaccord, dispute, round);
    const m = await fetchMaybeDispute(ctx.accord.rpc, dispute);
    if (!m.exists) {
      throw new Error(`DisputeNotFound: ${dispute} — cannot derive AppealBond count`);
    }
    const appealN = m.data.currentRound;
    const bonds: Address[] = [];
    for (let i = 0; i < appealN; i++) {
      const [pda] = await findAppealBondPda({ dispute, roundIdx: i });
      bonds.push(pda);
    }
    return [...panel, ...bonds];
  }
  return splitAddressList(flag);
}
