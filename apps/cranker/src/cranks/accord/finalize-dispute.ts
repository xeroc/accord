/**
 * finalize_dispute crank — after the appeal window elapses with no appeal,
 * settle the final round: slash incoherent jurors, redistribute, write
 * `final_ruling`, transition to `Final`. Permissionless. remainingAccounts =
 * current panel's JurorStake PDAs + one AppealBond PDA per prior appeal.
 * (lib.rs:1187, ADR-0004/0020, milestone accord-27r5.)
 */
import { DisputeState, finalizeDispute, type VotingAccounts } from "@useaccord/sdk";
import type { Address } from "@solana/kit";
import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { appealBondPda, fetchDispute, fetchRound, panelStakePdas, roundPda } from "../../util.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"finalize_dispute">,
): Promise<CrankResult> {
  const d = await fetchDispute(ctx.accord.rpc, action.dispute);
  if (d.data.state !== DisputeState.RoundResolved) {
    return {
      skipped: `dispute state ${DisputeState[d.data.state]} not RoundResolved`,
    };
  }
  const roundAddr = await roundPda(ctx.programId, d.address, d.data.currentRound);
  const round = await fetchRound(ctx.accord.rpc, roundAddr);
  const accounts: VotingAccounts = {
    signer: ctx.cranker,
    subaccord: d.data.subaccord,
    dispute: d.address,
    round: roundAddr,
  };
  // Current panel stakes, then one AppealBond PDA per prior appeal round
  // (rounds 1..currentRound — each appeal opened round currentRound+1).
  const remaining: Address[] = await panelStakePdas(
    ctx.programId,
    d.data.subaccord,
    round.data.jurors,
  );
  for (let r = 1; r <= d.data.currentRound; r++) {
    remaining.push(await appealBondPda(ctx.programId, d.address, r));
  }
  const ix = finalizeDispute(ctx.accord.adapter, ctx.programId, accounts, remaining);
  const signature = await ctx.sendIx(ix);
  ctx.log("finalize_dispute", d.address, signature);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "finalize_dispute", execute);
}
