/**
 * draw-seat.ts — per-seat draw_seat crank (milestone accord-27r5, bean
 * accord-e539).
 *
 * For a Dispute in `Created` with committed VRF and an unfilled panel: rebuild
 * the stake accumulator from `getProgramAccounts(JurorStake)`, verify it matches
 * `dispute.frozenRoot`, resolve each seat via the SDK sortition (VRF seed →
 * stake-weighted slot → collision re-roll → Merkle proof), and send one
 * `draw_seat` tx per remaining seat. One instruction per tx — no bundling
 * (1232-byte limit). On a simulation failure (state moved), stop the seat loop;
 * the next reconcile cycle retries from the on-chain seat count.
 *
 * Sources of truth:
 *   - sortition + proof: @useaccord/sdk `resolveSeat` / `proofFor`
 *   - instruction builder: @useaccord/sdk `drawSeat` (via the adapter seam)
 *   - frozen-root gate: ./tree-cache.ts `TreeCache.getVerifiedForDispute`
 *   - on-chain draw_seat: programs/accord/src/lib.rs
 */
import {
  getAddressDecoder,
  getAddressEncoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  ACCORD_PROGRAM_ID,
  Accord,
  drawSeat,
  findJurorStakePda,
  findRoundPda,
  panelSizeForRound,
  resolveSeat,
  type Dispute,
  type LeafClaim,
  type MerkleAccumulator,
  type MSTNode,
  type Round,
  type SeatMembership,
  type VrfDrawAccounts,
} from "@useaccord/sdk";

import type { CrankContext, CrankDispatch, CrankHandler } from "../dispatch.js";
import { SimulationError } from "../send.js";
import { TreeCache } from "../tree-cache.js";

/** A resolved seat: sortition result + the seat number it maps to. */
export interface ResolvedSeat {
  seat: number;
  leaf: LeafClaim;
  index: number;
  proof: MSTNode[];
  retries: number;
}

/**
 * Resolve a contiguous range of seats [`fromSeat`, `panelSize`) against the
 * frozen accumulator, growing the already-drawn set as each seat resolves so
 * the SDK collision re-roll avoids jurors drawn earlier in the same pass.
 *
 * Pure — no chain access. The caller sends one tx per result; the sortition is
 * deterministic from (committedVrf, dispute, round, tree, alreadyDrawn).
 */
export async function resolvePanel(opts: {
  committedVrf: Uint8Array;
  disputeBytes: Uint8Array;
  roundIdx: number;
  fromSeat: number;
  panelSize: number;
  tree: MerkleAccumulator;
  alreadyDrawn: Uint8Array[];
  drawAttempt?: number;
}): Promise<ResolvedSeat[]> {
  const {
    committedVrf,
    disputeBytes,
    roundIdx,
    fromSeat,
    panelSize,
    tree,
    alreadyDrawn,
    drawAttempt = 0,
  } = opts;
  const drawn: Uint8Array[] = [...alreadyDrawn];
  const result: ResolvedSeat[] = [];
  for (let seat = fromSeat; seat < panelSize; seat++) {
    const r = await resolveSeat(
      committedVrf,
      disputeBytes,
      roundIdx,
      seat,
      tree,
      drawn,
      1024,
      drawAttempt,
    );
    result.push({
      seat,
      leaf: r.leaf,
      index: r.index,
      proof: r.proof,
      retries: r.retries,
    });
    drawn.push(r.leaf.juror);
  }
  return result;
}

// --- module-level singletons (one RPC + wallet for the process lifetime) ----

let _treeCache: TreeCache | null = null;
let _accord: Accord | null = null;

function getTreeCache(ctx: CrankContext): TreeCache {
  if (!_treeCache) _treeCache = new TreeCache(ctx.rpc);
  return _treeCache;
}

function getAccord(ctx: CrankContext): Accord {
  if (!_accord) {
    const endpoint = process.env.ACCORD_RPC_URL;
    if (!endpoint) throw new Error("ACCORD_RPC_URL not set");
    _accord = new Accord({ endpoint, signer: ctx.wallet.signer });
  }
  return _accord;
}

/** The draw_seat handler. Draws all remaining seats from `action.seat`. */
export const drawSeatHandler: CrankHandler = async (ctx, action) => {
  if (action.kind !== "draw_seat") return;
  const { dispute, round } = ctx;
  const d = dispute.data;

  // 1. Verify the live tree matches the frozen root (skip on mismatch).
  const tree = await getTreeCache(ctx).getVerifiedForDispute(d);
  if (tree === null) return;

  // 2. No stake frozen — can't sortition.
  if (tree.rootSum <= 0n) return;

  // 3. Extract sortition params.
  if (d.committedVrf.__option !== "Some") return;
  const committedVrf = new Uint8Array(d.committedVrf.value);
  const disputeBytes = addressBytes(dispute.address);
  const roundIdx = d.currentRound;
  const drawAttempt = round?.data.drawAttempt ?? 0;
  const panel = panelSizeForRound(roundIdx);
  if (panel === null) return;

  // 4. Already-drawn jurors (collision set) from the on-chain round state.
  const alreadyDrawn = jurorsDrawn(round?.data ?? null);

  // 5. Resolve each remaining seat + send one tx per seat.
  const accord = getAccord(ctx);
  const drawn: Uint8Array[] = [...alreadyDrawn];
  for (let seat = action.seat; seat < panel; seat++) {
    const r = await resolveSeat(
      committedVrf,
      disputeBytes,
      roundIdx,
      seat,
      tree,
      drawn,
      1024,
      drawAttempt,
    );
    const jurorAddr = addressFromBytes(r.leaf.juror);
    const [jurorStake] = await findJurorStakePda({
      subaccord: d.subaccord,
      juror: jurorAddr,
    });
    const [roundPda] = await findRoundPda({
      dispute: dispute.address,
      roundIdx,
    });

    const membership: SeatMembership = {
      leaf: r.leaf,
      index: r.index,
      proof: r.proof,
      jurorStake,
      retries: r.retries,
    };
    const accounts: VrfDrawAccounts = {
      caller: ctx.wallet.address,
      subaccord: d.subaccord,
      dispute: dispute.address,
    };
    const ix = drawSeat(accord.adapter, ACCORD_PROGRAM_ID, accounts, roundPda, seat, membership);
    try {
      await ctx.send(ix);
    } catch (e) {
      if (e instanceof SimulationError) return; // state moved — next cycle retries
      throw e;
    }
    drawn.push(r.leaf.juror);
  }
};

/** Register the draw_seat handler on the dispatch map. */
export function registerDrawSeatCrank(dispatch: CrankDispatch): void {
  dispatch.register("draw_seat", drawSeatHandler);
}

// --- helpers ----------------------------------------------------------------

/** Address → 32 raw bytes (the sortition seed's dispute field). */
function addressBytes(addr: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(addr));
}

/** 32 raw bytes → Address (a resolved juror leaf back to a typed address). */
function addressFromBytes(bytes: Uint8Array): Address {
  return getAddressDecoder().decode(bytes) as Address;
}

/** The jurors already drawn in this round, as 32-byte arrays for sortition. */
function jurorsDrawn(round: Round | null): Uint8Array[] {
  if (round === null) return [];
  const enc = getAddressEncoder();
  const out: Uint8Array[] = [];
  for (let i = 0; i < round.jurorCount; i++) {
    out.push(new Uint8Array(enc.encode(round.jurors[i]!)));
  }
  return out;
}

// Re-exported for the handler signature (Dispute/Round carry frozenRoot etc.).
export type { Dispute, ReadonlyUint8Array };
