/**
 * file_dispute crank — Synod SPEC §Instructions #3 (bean accord-unja).
 * A full-roster Opening case files its single Accord dispute: the resolver
 * gates on roster + state; this executor re-checks both (a concurrent cranker
 * may have filed), recovers the case seeds, and wires the four Accord CPI
 * extras (`["dispute", case, 0]` + AccordState + the Subaccord fee_vault ATA +
 * the program id — the facade appends them as remaining_accounts). The
 * permissionless caller pays the dispute rent; the frozen fee flows
 * vault → Subaccord fee_vault.
 */
import { CaseState, fileDispute, findBoundDisputePda, findCaseVaultPda } from "@useaccord/synod";

import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { accordStatePda, ataOf, fetchSubaccord, fetchSynodCase } from "../../util.js";
import { recoverCaseSeeds } from "./case-seeds.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"synod_file_dispute">,
): Promise<CrankResult> {
  const kase = await fetchSynodCase(ctx.rpc, action.case);
  if (kase.data.state !== CaseState.Opening) {
    return { skipped: `not opening (state=${CaseState[kase.data.state] ?? kase.data.state})` };
  }
  // Early lock: full roster files regardless of the deadline (on-chain gate).
  if (kase.data.joined !== (1 << kase.data.partyCount) - 1) {
    return { skipped: `roster incomplete (joined=0b${kase.data.joined.toString(2)})` };
  }
  // parties[0] is the opener (naming order); the nonce is scanned + cached.
  const opener = kase.data.parties[0]!;
  const seeds = await recoverCaseSeeds(opener, action.case);
  if (seeds === null) {
    return {
      skipped: `case-open nonce not recoverable within the scan cap — open with a small sequential nonce for crank coverage`,
    };
  }
  const sub = await fetchSubaccord(ctx.rpc, kase.data.subaccord);
  const feeMint = sub.data.feeToken;
  const ix = await fileDispute(
    {
      caller: ctx.signer,
      opener,
      case: action.case,
      subaccord: kase.data.subaccord,
      feeMint,
      vault: await findCaseVaultPda(feeMint, action.case),
    },
    { nonce: seeds.nonce },
    {
      accordDispute: (await findBoundDisputePda(action.case))[0],
      accordState: await accordStatePda(ctx.programId),
      accordFeeVault: await ataOf(feeMint, kase.data.subaccord),
    },
  );
  const signature = await ctx.sendIx(ix);
  ctx.log("synod_file_dispute", action.case, `${action.case} ${signature}`);
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "synod_file_dispute", execute);
}
