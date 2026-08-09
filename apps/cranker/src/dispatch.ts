/**
 * Crank dispatch — maps a {@link CrankAction} (from the reconciler's state
 * resolver, bean accord-rnel) to its executor in `./cranks/`. Each executor
 * builds one SDK instruction and sends it via {@link CrankContext.sendIx}.
 *
 * The draw_seat crank lives separately (bean accord-7sky — it needs the MST
 * tree cache + per-seat Merkle proofs, unlike these nine SDK-direct cranks).
 *
 * Milestone accord-27r5.
 */
import type {
  CrankAction,
  CrankContext,
  CrankKind,
  CrankResult,
} from "./types.js";
import { execute as requestVrf } from "./cranks/request-vrf.js";
import { execute as finalizeRound } from "./cranks/finalize-round.js";
import { execute as finalizeDispute } from "./cranks/finalize-dispute.js";
import { execute as settleRound } from "./cranks/settle-round.js";
import { execute as cancelDispute } from "./cranks/cancel-dispute.js";
import { execute as redraw } from "./cranks/redraw.js";
import { execute as executeUpdate } from "./cranks/execute-update.js";
import { execute as executeUnpause } from "./cranks/execute-unpause.js";
import { execute as claimRefund } from "./cranks/claim-refund.js";

export type CrankExecutor = (
  ctx: CrankContext,
  action: CrankAction,
) => Promise<CrankResult>;

/** kind → executor. One entry per non-draw crank. */
export const CRANK_DISPATCH: Record<CrankKind, CrankExecutor> = {
  request_vrf: requestVrf as CrankExecutor,
  finalize_round: finalizeRound as CrankExecutor,
  finalize_dispute: finalizeDispute as CrankExecutor,
  settle_round: settleRound as CrankExecutor,
  cancel_dispute: cancelDispute as CrankExecutor,
  redraw: redraw as CrankExecutor,
  execute_update: executeUpdate as CrankExecutor,
  execute_unpause: executeUnpause as CrankExecutor,
  claim_refund: claimRefund as CrankExecutor,
};

/**
 * Resolve + send one crank action. Throws if the action kind is unknown.
 * The reconciler calls this per dispute; `null` actions (nothing to do) are
 * filtered upstream.
 */
export async function dispatchCrank(
  ctx: CrankContext,
  action: CrankAction,
): Promise<CrankResult> {
  const run = CRANK_DISPATCH[action.kind];
  if (!run) throw new Error(`No crank registered for kind: ${action.kind}`);
  return run(ctx, action);
}
