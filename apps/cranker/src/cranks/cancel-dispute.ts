/**
 * cancel_dispute crank — a stalled dispute (no ruling within the pre-draw
 * timeout) is cancelled: filer fee refunded, current round's active_draws
 * released. Permissionless timeout exit. remainingAccounts = current Round +
 * its JurorStake PDAs + the dispute's AppealBond PDAs (same layout as
 * redraw's Fail branch). (lib.rs:1539, milestone accord-27r5.)
 */
import { cancelDispute, type CancelDisputeAccounts } from "@useaccord/sdk";
import type { Address } from "@solana/kit";
import { registerCrank, type CrankDispatch } from "../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import {
  appealBondPda,
  ataOf,
  fetchDispute,
  fetchRound,
  fetchSubaccord,
  panelStakePdas,
  roundPda,
} from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"cancel_dispute">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  const sub = await fetchSubaccord(ctx.accord.rpc, d.data.subaccord);
  const roundAddr = await roundPda(ctx.programId, d.address, d.data.currentRound);
  const [filerAta, feeVault] = await Promise.all([
    ataOf(sub.data.feeToken, d.data.filer),
    ataOf(sub.data.feeToken, d.data.subaccord),
  ]);
  const accounts: CancelDisputeAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    feeToken: sub.data.feeToken,
    filerTokenAccount: filerAta,
    feeVault,
  };
  // remainingAccounts: current round PDA, its panel stakes, then AppealBonds.
  const remaining: Address[] = [roundAddr];
  try {
    const round = await fetchRound(ctx.accord.rpc, roundAddr);
    remaining.push(...(await panelStakePdas(ctx.programId, d.data.subaccord, round.data.jurors)));
  } catch {
    // round may not exist if cancelled pre-draw; remaining carries just bonds.
  }
  for (let r = 1; r <= d.data.currentRound; r++) {
    remaining.push(await appealBondPda(ctx.programId, d.address, r));
  }
  const ix = cancelDispute(ctx.accord.adapter, ctx.programId, accounts, remaining);
  const signature = await ctx.sendIx(ix);
  ctx.log("cancel_dispute", d.address, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "cancel_dispute", execute);
}
