/**
 * advance_withdrawal crank — Canon SPEC §Instructions #7 (bean accord-7fj6).
 * A `WithdrawPending` item whose `withdrawal_timelock` elapsed unchallenged
 * returns `accumulated_stake` to the submitter and removes the item. The
 * resolver gates on the timelock; this executor re-checks state and derives
 * the submitter + vault ATAs from on-chain state. Time is NOT re-checked —
 * the on-chain handler is the guard on the same monotonic unix clock.
 */
import { ItemState, advanceWithdrawal } from "@useaccord/canon";

import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { ataOf, fetchCanonItem, fetchCanonList } from "../../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"canon_advance_withdrawal">,
): Promise<CrankResult> {
  const item = await fetchCanonItem(ctx.rpc, action.item);
  if (item.data.state !== ItemState.WithdrawPending) {
    return {
      skipped: `not withdraw-pending (state=${ItemState[item.data.state] ?? item.data.state})`,
    };
  }
  const list = await fetchCanonList(ctx.rpc, item.data.list);
  const feeMint = list.data.feeMint;
  const ix = advanceWithdrawal({
    caller: ctx.signer,
    list: item.data.list,
    item: action.item,
    feeMint,
    submitterTokenAccount: await ataOf(feeMint, item.data.submitter),
    vault: await ataOf(feeMint, item.data.list),
  });
  const signature = await ctx.sendIx(ix);
  ctx.log("canon_advance_withdrawal", action.item, `${action.item} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "canon_advance_withdrawal", execute);
}
