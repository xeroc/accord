/**
 * redraw crank — a `RedrawEligible` dispute (reveal shortfall, ADR-0021) is
 * re-seeded at the same panel size: no-shows slashed, `draw_attempt` bumped,
 * round cleared back to `Created`. On exhaustion (`draw_attempt + 1 ≥
 * max_draw_attempts`) → `Failed` and the filer fee is refunded from feeVault.
 * remainingAccounts = the shortfall round's drawn JurorStake PDAs (panel).
 * (lib.rs redraw, ADR-0021, milestone accord-27r5.)
 */
import { DisputeState, redraw, type RedrawAccounts } from "@useaccord/sdk";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import {
  ataOf,
  fetchDispute,
  fetchRound,
  fetchSubaccord,
  panelStakePdas,
  roundPda,
  TOKEN_PROGRAM_ID,
} from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"redraw">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  if (d.data.state !== DisputeState.RedrawEligible) {
    return {
      skipped: `dispute not RedrawEligible (state ${DisputeState[d.data.state]})`,
    };
  }
  const sub = await fetchSubaccord(ctx.accord.rpc, d.data.subaccord);
  const roundAddr = await roundPda(
    ctx.programId,
    d.address,
    d.data.currentRound,
  );
  const round = await fetchRound(ctx.accord.rpc, roundAddr);
  const [filerAta, feeVault] = await Promise.all([
    ataOf(sub.data.feeToken, d.data.filer),
    ataOf(sub.data.feeToken, d.data.subaccord),
  ]);
  const accounts: RedrawAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    round: roundAddr,
    feeToken: sub.data.feeToken,
    filerTokenAccount: filerAta,
    feeVault,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
  const remaining = await panelStakePdas(
    ctx.programId,
    d.data.subaccord,
    round.data.jurors,
  );
  const ix = redraw(ctx.accord.adapter, ctx.programId, accounts, remaining);
  const signature = await ctx.sendIx(ix);
  ctx.log("redraw", d.address, signature);
  return { signature };
}
