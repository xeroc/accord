/**
 * reclaim_slot crank — pushes a fully-drained JurorStake's tree_index onto
 * the Subaccord free list (RECLAIM-LEAF). The resolver discovers reclaimable
 * slots; this executor fetches the Subaccord + all JurorStakes, rebuilds the
 * canonical MST, derives the Merkle path, and fires. Permissionless — the
 * cranker keypair is the caller/signer. (lib.rs:798, RECLAIM-LEAF.)
 */
import {
  findJurorStakesBySubaccord,
  prepareStakeProof,
  reclaimSlot,
  type JurorStakeLeaf,
  type SubaccordAccumulatorView,
} from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../types.js";
import { fetchSubaccord } from "../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"reclaim_slot">,
): Promise<CrankResult> {
  // Fetch the Subaccord to build the accumulator view.
  const subaccord = await fetchSubaccord(ctx.accord.rpc, action.subaccord);
  const view: SubaccordAccumulatorView = {
    rootHash: new Uint8Array(subaccord.data.rootHash),
    nextIndex: subaccord.data.nextIndex,
    depth: subaccord.data.depth,
  };

  // Fetch ALL JurorStakes for this Subaccord to rebuild the canonical tree.
  const allStakes = await findJurorStakesBySubaccord(ctx.accord.rpc, action.subaccord);

  // Find the target JurorStake and verify it's reclaimable.
  const target = allStakes.find((s) => s.address === action.jurorStake);
  if (!target) return { skipped: "juror stake account not found" };
  const js = target.data;
  if (js.staked !== 0n || js.activeDraws !== 0 || js.stakeDelta !== 0n || js.feesEarned !== 0n) {
    return { skipped: "juror stake not fully drained" };
  }

  // Map all stakes to the leaf format the proof builder expects.
  const leaves: JurorStakeLeaf[] = allStakes.map((s) => ({
    juror: s.data.juror,
    staked: s.data.staked,
    treeIndex: s.data.treeIndex,
  }));

  // Build the Merkle path for the drained juror's leaf position.
  const proof = await prepareStakeProof(view, leaves, js.juror);

  // Build + send the reclaim instruction.
  const ix = reclaimSlot(
    ctx.accord.adapter,
    ctx.programId,
    { subaccord: action.subaccord, jurorStake: action.jurorStake },
    proof.path,
  );
  const signature = await ctx.sendIx(ix);
  ctx.log("reclaim_slot", null, `${action.subaccord} idx=${js.treeIndex} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "reclaim_slot", execute);
}
