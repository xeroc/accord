/**
 * settle_round crank — settle one prior round's economics (slash incoherent
 * jurors + redistribute) after the dispute is Final. The resolver picks
 * WHICH prior round via `action.roundIdx`; this executor fetches that round
 * + its panel stakes. Idempotent: on-chain `settled` flag no-ops repeats.
 * (lib.rs:1291, bean accord-r6ti, milestone accord-27r5.)
 */
import {
  DisputeState,
  settleRound,
  type SettleRoundAccounts,
} from "@useaccord/sdk";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import { fetchDispute, fetchRound, panelStakePdas, roundPda } from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"settle_round">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  if (d.data.state !== DisputeState.Final) {
    return {
      skipped: `dispute not Final (state ${DisputeState[d.data.state]})`,
    };
  }
  const roundAddr = await roundPda(ctx.programId, d.address, action.roundIdx);
  const round = await fetchRound(ctx.accord.rpc, roundAddr);
  if (round.data.settled !== 0) {
    return { skipped: `round ${action.roundIdx} already settled` };
  }
  const accounts: SettleRoundAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    round: roundAddr,
  };
  const remaining = await panelStakePdas(
    ctx.programId,
    d.data.subaccord,
    round.data.jurors,
  );
  const ix = settleRound(
    ctx.accord.adapter,
    ctx.programId,
    accounts,
    action.roundIdx,
    remaining,
  );
  const signature = await ctx.sendIx(ix);
  ctx.log("settle_round", d.address, `round=${action.roundIdx} ${signature}`);
  return { signature };
}
