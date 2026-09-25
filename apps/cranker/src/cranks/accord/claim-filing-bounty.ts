/**
 * claim_filing_bounty crank (ADR-0030) — after a dispute finalizes WITHOUT
 * ever being appealed (`current_round == 0` at Final), the filer's filing-time
 * `+1 · fee_per_juror` flip-bounty unit sits on `Dispute.bounty_pool`. This
 * permissionless sweep pays it vault → filer ATA. Idempotent on-chain (the
 * pool is zeroed on payout). Every other terminal shape disposes of the pool
 * elsewhere (finalize_dispute / the Failed transitions).
 */
import { DisputeState, claimFilingBounty, type ClaimFilingBountyAccounts } from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { ataOf, fetchDispute, fetchSubaccord } from "../../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"claim_filing_bounty">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  if (d.data.state !== DisputeState.Final) {
    return { skipped: `dispute not Final (state ${DisputeState[d.data.state]})` };
  }
  if (d.data.currentRound !== 0) {
    return {
      skipped: `appeals happened (round ${d.data.currentRound}) — pool consumed at finalize`,
    };
  }
  if (d.data.bountyPool === 0n) return { skipped: "bounty already claimed/zero" };
  const sub = await fetchSubaccord(ctx.accord.rpc, d.data.subaccord);
  const [filerAta, feeVault] = await Promise.all([
    ataOf(sub.data.feeToken, d.data.filer),
    ataOf(sub.data.feeToken, d.data.subaccord),
  ]);
  const accounts: ClaimFilingBountyAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    feeToken: sub.data.feeToken,
    filerTokenAccount: filerAta,
    feeVault,
  };
  const ix = claimFilingBounty(ctx.accord.adapter, ctx.programId, accounts);
  const signature = await ctx.sendIx(ix);
  ctx.log("claim_filing_bounty", d.address, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "claim_filing_bounty", execute);
}
