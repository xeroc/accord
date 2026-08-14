/**
 * advance_pending crank — Canon SPEC §Instructions #3 (bean accord-7fj6).
 * A `Pending` item whose `listing_window` (measured from `submitted_at`)
 * elapsed unchallenged auto-lists. The resolver gates on the window; this
 * executor re-checks state (a concurrent cranker may have advanced it) and
 * fires. Time is NOT re-checked: the on-chain handler is the guard, and the
 * resolver + handler read the same unix clock (monotonic between resolve and
 * send).
 */
import { ItemState, advancePending } from "@useaccord/canon";

import { registerCrank, type CrankDispatch } from "../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import { fetchCanonItem } from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"advance_pending">,
): Promise<CrankResult> {
  const item = await fetchCanonItem(ctx.rpc, action.item);
  if (item.data.state !== ItemState.Pending) {
    return { skipped: `not pending (state=${ItemState[item.data.state] ?? item.data.state})` };
  }
  const ix = advancePending({
    caller: ctx.signer,
    list: item.data.list,
    item: action.item,
  });
  const signature = await ctx.sendIx(ix);
  ctx.log("advance_pending", null, `${action.item} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "advance_pending", execute);
}
