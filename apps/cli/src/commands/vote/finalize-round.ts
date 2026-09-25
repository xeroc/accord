/**
 * `useaccord vote:finalize-round` — permissionless crank: plurality/median
 * tally → RoundResolved. SDK: `finalizeRound` (voting.ts).
 *
 * After the reveal window elapses (or once every juror has revealed), anyone
 * advances the round to resolved. ADR-0029: no fee credit happens here — the
 * round's entire fee pot settles at settle_round/finalize_dispute against
 * the FINAL ruling, so the command takes no remaining accounts.
 */
import { Flags } from "@oclif/core";
import { type Address } from "@solana/kit";

import {
  Accord,
  fetchMaybeRound,
  findJurorStakePda,
  findRoundPda,
  type VotingAccounts,
} from "@useaccord/sdk";

import { ChainCommand, chainFlags } from "../../lib/base-command.js";

export default class VoteFinalizeRound extends ChainCommand {
  static summary = "Permissionless finalize-round crank (plurality tally → RoundResolved)";

  static description =
    "Advance a round to RoundResolved after the reveal window (ADR-0029: fees " +
    "settle at finality — no remaining accounts).";

  static examples = [
    "<%= config.bin %> vote:finalize-round --subaccord 9aJb… --dispute 5xQ… --round-idx 0",
  ];

  static flags = {
    ...chainFlags,
    subaccord: Flags.string({ description: "Subaccord PDA address", required: true }),
    dispute: Flags.string({ description: "Dispute PDA address", required: true }),
    "round-idx": Flags.integer({
      description: "Round index (u32) — the round PDA is derived from (dispute, round-idx)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(VoteFinalizeRound);
    this.applyOutput(flags);

    const ctx = await this.loadChain(flags);
    const [round] = await findRoundPda(
      { dispute: flags.dispute as Address, roundIdx: flags["round-idx"] },
      { programAddress: Accord.PROGRAM_ID },
    );
    const accounts: VotingAccounts = {
      signer: ctx.signer.address,
      subaccord: flags.subaccord as Address,
      dispute: flags.dispute as Address,
      round,
    };

    const instruction = ctx.accord.methods.finalizeRound(accounts);

    if (flags["dry-run"]) {
      this.emitDryRun(instruction);
      return;
    }

    const signature = await this.sendInstruction(ctx, instruction);
    this.emitSend(signature, { round });
  }
}

/**
 * Resolve `--remaining-accounts` for the finalize cranks.
 *
 * - `undefined`/empty → `[]`
 * - `"auto"` → fetch the round, derive the panel's JurorStake PDAs (first
 *   `jurorCount` of `round.jurors`).
 * - otherwise → comma-separated addresses, trimmed.
 *
 * {@link resolvePanelWithBonds} (in finalize-dispute) extends this with
 * AppealBond PDAs for `finalize_dispute`.
 */
export async function resolveRemaining(
  ctx: { accord: Accord; commitment?: string },
  flag: string | undefined,
  subaccord: Address,
  dispute: Address,
  round: Address,
): Promise<Address[]> {
  if (!flag) return [];
  if (flag === "auto") {
    return resolvePanelJurorStakes(ctx.accord, subaccord, dispute, round);
  }
  return splitAddressList(flag);
}

/** Derive the drawn panel's JurorStake PDAs from the on-chain round. */
export async function resolvePanelJurorStakes(
  accord: Accord,
  subaccord: Address,
  dispute: Address,
  round: Address,
): Promise<Address[]> {
  const m = await fetchMaybeRound(accord.rpc, round);
  if (!m.exists) {
    throw new Error(
      `RoundNotFound: ${round} (derived from dispute ${dispute}) — has the draw completed?`,
    );
  }
  const panel = m.data.jurors.slice(0, m.data.jurorCount);
  const out: Address[] = [];
  for (const juror of panel) {
    const [pda] = await findJurorStakePda({ subaccord, juror });
    out.push(pda);
  }
  return out;
}

/** Split a comma-separated address list, trimming whitespace. */
export function splitAddressList(raw: string): Address[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as Address[];
}
