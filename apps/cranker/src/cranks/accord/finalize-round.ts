/**
 * finalize_round crank — advance a round to `RoundResolved` once the reveal window elapses OR every juror has revealed.
 * Writes the round result — plurality winner or median, per the dispute's
 * aggregation (ADR-0025). Permissionless. ADR-0029: credits nothing — the
 * round's fee pot settles at settle_round/finalize_dispute against the final
 * ruling, so no remaining_accounts. (lib.rs:1136, milestone accord-27r5.)
 */
import { DisputeState, finalizeRound, type VotingAccounts } from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { CrankContext, CrankResult, ActionOf } from "../../types.js";
import { fetchDispute, roundPda } from "../../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"finalize_round">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  const state = d.data.state;
  // finalize_round is valid from Reveal until RoundResolved. Skip otherwise
  // (another cranker or the user may have advanced it).
  if (
    state !== DisputeState.Reveal &&
    state !== DisputeState.Commit &&
    state !== DisputeState.Drawn &&
    state !== DisputeState.Review
  ) {
    return { skipped: `dispute state ${DisputeState[state]} not finalizable` };
  }
  const roundAddr = await roundPda(ctx.programId, d.address, d.data.currentRound);
  const accounts: VotingAccounts = {
    signer: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    round: roundAddr,
  };
  const ix = finalizeRound(ctx.accord.adapter, ctx.programId, accounts);
  const signature = await ctx.sendIx(ix);
  ctx.log("finalize_round", d.address, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "finalize_round", execute);
}
