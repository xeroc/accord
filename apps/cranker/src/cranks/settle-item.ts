/**
 * settle_item crank — Canon SPEC §Instructions #5 (bean accord-7fj6).
 * After the item's Accord dispute reaches `Final`, reads `final_ruling` and
 * redistributes: `keep` folds the challenge stake into the item (progressive
 * protection), `remove` pays the accumulated stake to the challenger as a
 * bounty. The resolver only fires this once the dispute is `Final`; this
 * executor re-checks the item state and derives every token account
 * (vault / challenger / submitter ATAs) from on-chain state.
 */
import { ItemState, settleItem } from "@useaccord/canon";

import { registerCrank, type CrankDispatch } from "../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import { ataOf, fetchCanonItem, fetchCanonList } from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"settle_item">,
): Promise<CrankResult> {
  const item = await fetchCanonItem(ctx.rpc, action.item);
  if (item.data.state !== ItemState.Disputed) {
    return { skipped: `not disputed (state=${ItemState[item.data.state] ?? item.data.state})` };
  }
  const list = await fetchCanonList(ctx.rpc, item.data.list);
  const feeMint = list.data.feeMint;
  const ix = settleItem({
    caller: ctx.signer,
    list: item.data.list,
    item: action.item,
    dispute: item.data.activeDispute,
    feeMint,
    vault: await ataOf(feeMint, item.data.list),
    challengerTokenAccount: await ataOf(feeMint, item.data.challenger),
    submitterTokenAccount: await ataOf(feeMint, item.data.submitter),
  });
  const signature = await ctx.sendIx(ix);
  ctx.log("settle_item", null, `${action.item} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "settle_item", execute);
}
