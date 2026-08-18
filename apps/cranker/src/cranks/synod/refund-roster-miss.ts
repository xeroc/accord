/**
 * refund_roster_miss crank — Synod SPEC §Instructions #4 (bean accord-unja).
 * After the join deadline with an incomplete roster, every JOINED party pulls
 * its stake `S` back out of the vault. The resolver gates on deadline +
 * roster + state and emits one party slot per cycle; this executor sweeps
 * every joined-unpaid party from `action.partyIndex` onwards — one tx per
 * party (the destination ATA identifies it; the on-chain `paid_out` bits make
 * replays no-ops, so a mid-sweep failure just resumes next cycle). Parties
 * whose `fee_token` ATA doesn't exist are skipped: a missing destination can
 * never block another (the manual pull with any owned token account is the
 * fallback). The deadline is NOT re-checked — the on-chain handler is the
 * guard on the same monotonic unix clock (canon advance_pending note).
 */
import { CaseState, findCaseVaultPda, refundRosterMiss } from "@useaccord/synod";

import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { accountExists, ataOf, fetchSubaccord, fetchSynodCase } from "../../util.js";
import { recoverCaseSeeds } from "./case-seeds.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"synod_refund_roster_miss">,
): Promise<CrankResult> {
  const kase = await fetchSynodCase(ctx.rpc, action.case);
  if (kase.data.state !== CaseState.Opening) {
    return { skipped: `not opening (state=${CaseState[kase.data.state] ?? kase.data.state})` };
  }
  const opener = kase.data.parties[0]!;
  const seeds = await recoverCaseSeeds(opener, action.case);
  if (seeds === null) {
    return {
      skipped: `case-open nonce not recoverable within the scan cap — open with a small sequential nonce for crank coverage`,
    };
  }
  const sub = await fetchSubaccord(ctx.rpc, kase.data.subaccord);
  const feeMint = sub.data.feeToken;
  const vault = await findCaseVaultPda(feeMint, action.case);

  // The sweep: snapshot bits only ever get MORE set, so a party skipped here
  // stays due, and one paid by an earlier tx of this loop is never revisited.
  let signature: string | undefined;
  let refunded = 0;
  for (let i = action.partyIndex; i < kase.data.partyCount; i++) {
    if ((kase.data.joined & (1 << i)) === 0 || (kase.data.paidOut & (1 << i)) !== 0) continue;
    const partyAta = await ataOf(feeMint, kase.data.parties[i]!);
    if (!(await accountExists(ctx.rpc, partyAta))) {
      ctx.log("synod_refund_roster_miss", action.case, `party ${i} ATA missing — skipped`);
      continue;
    }
    const ix = await refundRosterMiss(
      {
        caller: ctx.signer,
        opener,
        case: action.case,
        subaccord: kase.data.subaccord,
        feeMint,
        partyTokenAccount: partyAta,
        vault,
      },
      { nonce: seeds.nonce },
    );
    signature = await ctx.sendIx(ix);
    refunded++;
  }
  if (signature === undefined) {
    return {
      skipped: `no refundable party with an existing ${feeMint} ATA (from slot ${action.partyIndex})`,
    };
  }
  ctx.log(
    "synod_refund_roster_miss",
    action.case,
    `${action.case} refunded ${refunded} ${refunded === 1 ? "party" : "parties"} ${signature}`,
  );
  return { signature };
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "synod_refund_roster_miss", execute);
}
