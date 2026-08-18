/**
 * claim crank — Synod SPEC §Instructions #5 (bean accord-y608).
 * Once the bound Accord dispute reaches `Final`/`Failed`, the due parties
 * pull their payouts. The resolver gates on case state + dispute finality and
 * emits one party slot per cycle; this executor re-checks both (a concurrent
 * cranker may have claimed) and sweeps every eligible slot:
 *   - `Final`, ruling `< party_count` — the prevailing party pulls the whole
 *     pot `N·S − fee`, one-shot (non-winner claims are deliberate on-chain
 *     no-ops — they must not burn a tx or the cycle).
 *   - `Final`, ruling `== party_count` (neutral) — each unclaimed party pulls
 *     `⌊pot/N⌋`; the last claimant drains the remainder (on-chain math).
 *   - `Failed` — every party pulls its full `S` back.
 * Parties whose `fee_token` ATA doesn't exist are skipped — a missing
 * destination never blocks another (the app's manual claim is the fallback).
 * Payout idempotency is the on-chain `paid_out` bits, so a mid-sweep failure
 * just resumes next cycle.
 */
import { CaseState, claim, findCaseVaultPda, type SynodCase } from "@useaccord/synod";
import { DisputeState, NO_RULING } from "@useaccord/sdk";
import { registerCrank, type CrankDispatch } from "../../dispatch.js";
import type { ActionOf, CrankContext, CrankResult } from "../../types.js";
import { accountExists, ataOf, fetchDispute, fetchSubaccord, fetchSynodCase } from "../../util.js";
import { recoverCaseSeeds } from "./case-seeds.js";

export async function execute(
  ctx: CrankContext,
  action: ActionOf<"synod_claim">,
): Promise<CrankResult> {
  const kase = await fetchSynodCase(ctx.rpc, action.case);
  if (kase.data.state !== CaseState.Live) {
    return { skipped: `not live (state=${CaseState[kase.data.state] ?? kase.data.state})` };
  }
  const dispute = await fetchDispute(ctx.rpc, kase.data.dispute);
  if (dispute.data.state !== DisputeState.Final && dispute.data.state !== DisputeState.Failed) {
    return {
      skipped: `dispute not Final/Failed (state=${DisputeState[dispute.data.state] ?? dispute.data.state})`,
    };
  }

  // Sweep eligibility, mirroring the resolver: the Final ruling picks the
  // shape; Failed refunds everyone.
  const n = kase.data.partyCount;
  let slots: number[];
  if (dispute.data.state === DisputeState.Final) {
    const ruling = dispute.data.finalRuling;
    if (ruling === NO_RULING) {
      return { skipped: "Final without a ruling (invariant break)" };
    }
    if (ruling > BigInt(n)) {
      return { skipped: `ruling ${ruling} above neutral (on-chain InvalidRuling)` };
    }
    if (ruling < BigInt(n)) {
      const winner = Number(ruling);
      if ((kase.data.paidOut & (1 << winner)) !== 0) {
        return { skipped: `winner (party ${winner}) already paid` };
      }
      slots = [winner]; // one-shot pot pull — nobody else is due anything
    } else {
      slots = unpaidJoined(kase.data, action.partyIndex); // neutral floor shares
    }
  } else {
    slots = unpaidJoined(kase.data, action.partyIndex); // Failed: full S back
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

  let signature: string | undefined;
  let paid = 0;
  for (const i of slots) {
    const partyAta = await ataOf(feeMint, kase.data.parties[i]!);
    if (!(await accountExists(ctx.rpc, partyAta))) {
      ctx.log(
        "synod_claim",
        action.case,
        `party ${i} ATA missing — skipped (manual claim is the fallback)`,
      );
      continue;
    }
    const ix = await claim(
      {
        caller: ctx.signer,
        opener,
        case: action.case,
        dispute: kase.data.dispute,
        subaccord: kase.data.subaccord,
        feeMint,
        partyTokenAccount: partyAta,
        vault,
      },
      { nonce: seeds.nonce },
    );
    signature = await ctx.sendIx(ix);
    paid++;
  }
  if (signature === undefined) {
    return {
      skipped: `no claimable party with an existing ${feeMint} ATA (from slot ${action.partyIndex})`,
    };
  }
  ctx.log(
    "synod_claim",
    action.case,
    `${action.case} paid ${paid} ${paid === 1 ? "party" : "parties"} ${signature}`,
  );
  return { signature };
}

/** Joined-and-unpaid slots `[from, party_count)`, ascending. */
function unpaidJoined(kase: SynodCase, from: number): number[] {
  const out: number[] = [];
  for (let i = from; i < kase.partyCount; i++) {
    if ((kase.joined & (1 << i)) !== 0 && (kase.paidOut & (1 << i)) === 0) out.push(i);
  }
  return out;
}

/** Register this crank on the dispatch map. */
export function register(d: CrankDispatch): void {
  registerCrank(d, "synod_claim", execute);
}
