/**
 * execute_update crank — a PendingUpdate whose 48h timelock
 * (`execute_after_slot`) has elapsed is executed by any caller. The resolver
 * gates on `slot >= executeAfterSlot`; this executor finds the live
 * PendingUpdate PDA for the subaccord and fires. (lib.rs:372, ADR-0005/0007,
 * milestone accord-27r5.)
 */
import { canExecuteAt, executeSubaccordUpdate } from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import { findPendingUpdateForSubaccord } from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"execute_update">,
): Promise<CrankResult> {
  const pending = await findPendingUpdateForSubaccord(
    ctx.accord.rpc,
    ctx.programId,
    action.subaccord,
  );
  if (!pending) return { skipped: "no pending update for subaccord" };
  // Defensive double-check of the timelock (resolver already gated; slot may
  // have advanced between resolve and send).
  const slot = await ctx.accord.rpc.getSlot().send();
  if (!canExecuteAt(pending.data.executeAfterSlot, BigInt(slot))) {
    return {
      skipped: `timelock not elapsed (execute_after_slot=${pending.data.executeAfterSlot}, slot=${slot})`,
    };
  }
  const ix = executeSubaccordUpdate(
    ctx.accord.adapter,
    ctx.programId,
    ctx.cranker,
    action.subaccord,
    pending.address,
  );
  const signature = await ctx.sendIx(ix);
  ctx.log("execute_update", null, `${action.subaccord} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "execute_update", execute);
}
