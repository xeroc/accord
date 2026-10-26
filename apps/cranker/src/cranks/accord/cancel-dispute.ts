/**
 * cancel_dispute crank — a stalled dispute (no ruling within the pre-draw
 * timeout or the post-draw grace) is cancelled: filer fee refunded, every
 * drawn round's active_draws released. Permissionless timeout exit.
 *
 * remainingAccounts layout (current Round + panel, prior rounds + panels,
 * AppealBonds — strict accounting on-chain) is derived by the SDK's
 * deriveCancelDisputeRemainingAccounts, the single source shared with the
 * CLI (bean accord-br6a: this crank used to push the current-round PDA
 * unconditionally, so a never-drawn Created dispute — dead VRF oracle —
 * failed with InvalidPanelSize; on-chain requires an EMPTY list there).
 * (lib.rs cancel_dispute, milestone accord-27r5.)
 */
import {
  cancelDispute,
  deriveCancelDisputeRemainingAccounts,
  type CancelDisputeAccounts,
} from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { ataOf, fetchDispute, fetchSubaccord } from "../../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"cancel_dispute">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  const sub = await fetchSubaccord(ctx.accord.rpc, d.data.subaccord);
  const [filerAta, feeVault] = await Promise.all([
    ataOf(sub.data.feeToken, d.data.filer),
    ataOf(sub.data.feeToken, d.data.subaccord),
  ]);
  const accounts: CancelDisputeAccounts = {
    caller: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    feeToken: sub.data.feeToken,
    filerTokenAccount: filerAta,
    feeVault,
  };
  const remaining = await deriveCancelDisputeRemainingAccounts(
    ctx.accord.rpc,
    ctx.programId,
    d.address,
    d.data.subaccord,
    d.data.currentRound,
    d.data.drawnSeats,
  );
  const ix = cancelDispute(ctx.accord.adapter, ctx.programId, accounts, remaining);
  const signature = await ctx.sendIx(ix);
  ctx.log("cancel_dispute", d.address, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "cancel_dispute", execute);
}
