/**
 * request_vrf crank — a Dispute in `Created` with no `committed_vrf` needs
 * the magicblock VRF oracle CPI to fire (one-shot; the callback freezes the
 * accumulator root). The cranker pays. (ADR-0009, milestone accord-27r5.)
 */
import { requestVrf, type VrfDrawAccounts } from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import { fetchDispute } from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"request_vrf">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  if (d.data.committedVrf != null) {
    return { skipped: "committed_vrf already set" };
  }
  const accounts: VrfDrawAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
  };
  const ix = requestVrf(ctx.accord.adapter, ctx.programId, accounts, {
    oracleQueue: ctx.oracleQueue,
    programIdentity: ctx.programIdentity,
  });
  const signature = await ctx.sendIx(ix);
  ctx.log("request_vrf", d.address, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "request_vrf", execute);
}
