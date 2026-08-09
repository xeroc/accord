/**
 * claim_appeal_refund crank — after a dispute is Final/Failed, an appellant
 * whose appeal FLIPPED the ruling may reclaim their bond. `action.roundIdx`
 * is the round the appeal OPENED (selects the AppealBond PDA). The cranker
 * sweeps to the appellant's feeToken ATA (read from the bond so the caller
 * need not know it). Idempotent on-chain (bond zeroed on payout).
 * (lib.rs:1481, ADR-0004, milestone accord-27r5.)
 */
import {
  DisputeState,
  claimAppealRefund,
  type ClaimRefundAccounts,
} from "@useaccord/sdk";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import {
  appealBondPda,
  ataOf,
  fetchAppealBond,
  fetchDispute,
  fetchSubaccord,
} from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"claim_refund">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  if (
    d.data.state !== DisputeState.Final &&
    d.data.state !== DisputeState.Failed
  ) {
    return {
      skipped: `dispute not Final/Failed (state ${DisputeState[d.data.state]})`,
    };
  }
  const sub = await fetchSubaccord(ctx.accord.rpc, d.data.subaccord);
  const appealBondAddr = await appealBondPda(
    ctx.programId,
    d.address,
    action.roundIdx,
  );
  const bond = await fetchAppealBond(ctx.accord.rpc, appealBondAddr);
  if (bond.data.amount === 0n)
    return { skipped: "bond already claimed/zeroed" };
  const [claimantAta, feeVault] = await Promise.all([
    ataOf(sub.data.feeToken, bond.data.appellant),
    ataOf(sub.data.feeToken, d.data.subaccord),
  ]);
  const accounts: ClaimRefundAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    appealBond: appealBondAddr,
    feeToken: sub.data.feeToken,
    claimantTokenAccount: claimantAta,
    feeVault,
  };
  const ix = claimAppealRefund(
    ctx.accord.adapter,
    ctx.programId,
    accounts,
    action.roundIdx,
  );
  const signature = await ctx.sendIx(ix);
  ctx.log("claim_refund", d.address, `round=${action.roundIdx} ${signature}`);
  return { signature };
}
