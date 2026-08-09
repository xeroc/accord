/**
 * execute_unpause crank — a paused Subaccord whose `propose_unpause` armed a
 * 24h timelock (`pending_unpause_after`) is unpaused by any caller once the
 * slot elapses. The PauseState is a program-wide singleton. (lib.rs:120,
 * ADR-0007, milestone accord-27r5.)
 */
import { canExecuteAt, executeUnpause } from "@useaccord/sdk";
import type { CrankContext, CrankResult } from "../types.js";
import { fetchPauseState, pauseStatePda } from "../util.js";

export async function execute(ctx: CrankContext): Promise<CrankResult> {
  const pauseStateAddr = await pauseStatePda(ctx.programId);
  const ps = await fetchPauseState(ctx.accord.rpc, pauseStateAddr);
  const after = ps.data.pendingUnpauseAfter;
  if (after.__option !== "Some") return { skipped: "no pending unpause" };
  const slot = await ctx.accord.rpc.getSlot().send();
  if (!canExecuteAt(after.value, BigInt(slot))) {
    return { skipped: `unpause timelock not elapsed (slot=${slot})` };
  }
  const ix = executeUnpause(
    ctx.accord.adapter,
    ctx.programId,
    ctx.cranker,
    pauseStateAddr,
  );
  const signature = await ctx.sendIx(ix);
  ctx.log("execute_unpause", null, signature);
  return { signature };
}
