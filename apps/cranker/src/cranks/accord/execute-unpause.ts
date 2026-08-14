/**
 * execute_unpause crank — a paused Subaccord whose `propose_unpause` armed a
 * 24h timelock (`pending_unpause_after`) is unpaused by any caller once the
 * slot elapses. The AccordState is a program-wide singleton. (lib.rs:120,
 * ADR-0007, milestone accord-27r5.)
 */
import { isNone } from "@solana/kit";
import { canExecuteAt, executeUnpause } from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { CrankContext, CrankResult } from "../../types.js";
import { fetchAccordState, accordStatePda } from "../../util.js";

export async function execute(ctx: CrankContext): Promise<CrankResult> {
  const accordStateAddr = await accordStatePda(ctx.programId);
  const ps = await fetchAccordState(ctx.accord.rpc, accordStateAddr);
  const after = ps.data.pendingUnpauseAfter;
  if (isNone(after)) return { skipped: "no pending unpause" };
  const slot = await ctx.accord.rpc.getSlot().send();
  if (!canExecuteAt(after.value, BigInt(slot))) {
    return { skipped: `unpause timelock not elapsed (slot=${slot})` };
  }
  const ix = executeUnpause(ctx.accord.adapter, ctx.programId, ctx.cranker, accordStateAddr);
  const signature = await ctx.sendIx(ix);
  ctx.log("execute_unpause", null, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "execute_unpause", execute);
}
