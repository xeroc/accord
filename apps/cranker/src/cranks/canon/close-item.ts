/**
 * close_item crank — Canon SPEC §Instructions #8 (bean accord-m5fd).
 * Permissionless GC: any caller closes a settled (`Removed`) CanonItem PDA
 * and collects its rent-exempt lamports. For the cranker this is a
 * self-funding bounty — it only fires when the account's rent exceeds the tx
 * fee plus a margin. A missing account is an expected skip, not an error:
 * duplicate notifications and GPA staleness land here after a successful
 * close.
 */
import { ItemState, closeItem, fetchMaybeCanonItem, type CanonItem } from "@useaccord/canon";
import type { Account } from "@solana/kit";

import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";

/** Skip closes that don't pay for themselves: tx fee (5_000) + margin. */
export const MIN_CLOSE_PROFIT_LAMPORTS = 10_000n;

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"canon_close_item">,
): Promise<CrankResult> {
  const maybe = await fetchMaybeCanonItem(ctx.rpc, action.item);
  if (!maybe.exists) {
    return { skipped: "account already closed" };
  }
  const item = maybe as Account<CanonItem>;
  if (item.data.state !== ItemState.Removed) {
    return { skipped: `not removed (state=${ItemState[item.data.state] ?? item.data.state})` };
  }
  if (item.lamports <= MIN_CLOSE_PROFIT_LAMPORTS) {
    return { skipped: `unprofitable (lamports=${item.lamports} ≤ ${MIN_CLOSE_PROFIT_LAMPORTS})` };
  }
  const ix = closeItem({ caller: ctx.signer, item: action.item }, ctx.canonProgramId);
  const signature = await ctx.sendIx(ix);
  ctx.log("canon_close_item", action.item, `${action.item} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "canon_close_item", execute);
}
