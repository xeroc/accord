// tracker.ts — duty tracker (bean accord-fgxw): turns a decoded on-chain
// `Round` into a `DutyRecord` for our operator key, with chain-clock window
// math mirrored from the on-chain gates.
//
// Sources of truth:
//   - windows:  Round.review_end / commit_end / reveal_end (state.rs) —
//     computed on-chain from the CaseTerms frozen at filing; the tracker
//     reads them rather than re-deriving (accounts are authoritative,
//     milestone decision 4 — a local re-derivation could drift from the
//     gates and is a second implementation of the same math).
//   - gates:    commit.rs  `review_end <= now < commit_end`
//               reveal.rs  `(now >= commit_end || all_committed) && now < reveal_end`
//   - redraw:   ADR-0021 — same Round PDA (same round_idx), draw_attempt+1,
//     fresh panel; our prior record for the slot is superseded.
//
// All persistence + clock IO is injected (same seams as the rest of the
// duty pipeline); the module is pure orchestration.
import type { DutyRecord, DutyStore } from "./types.js";
import type { TraceSink } from "../trace/sink.js";

/** Where a duty's round sits on the chain clock. */
export type DutyPhase = "review" | "commit" | "reveal" | "final";

/** Chain-clock deadlines of a round, unix seconds. */
export interface RoundWindows {
  reviewEnd: number;
  commitEnd: number;
  revealEnd: number;
}

/**
 * Structural view of a decoded SDK `Round` — accepts the generated type
 * as-is (bigint ends) without coupling to it. Only the first `jurorCount`
 * entries of `jurors` are live; the fixed array's tail is dead slots.
 */
export interface RoundView {
  dispute: string;
  roundIdx: number;
  drawAttempt: number;
  jurorCount: number;
  jurors: readonly string[];
  reviewEnd: number | bigint;
  commitEnd: number | bigint;
  revealEnd: number | bigint;
}

/** Normalize decoded (possibly bigint) round ends to plain unix seconds. */
export function roundWindows(round: RoundView): RoundWindows {
  return {
    reviewEnd: Number(round.reviewEnd),
    commitEnd: Number(round.commitEnd),
    revealEnd: Number(round.revealEnd),
  };
}

/**
 * Phase of a round at `now`, mirroring the on-chain gates exactly:
 * review `[.., reviewEnd)`, commit `[reviewEnd, commitEnd)`, reveal
 * `[commitEnd, revealEnd)` — with the reveal.rs early-open relaxation when
 * the whole panel has committed — final from `revealEnd` on.
 */
export function dutyPhase(windows: RoundWindows, now: number, allCommitted = false): DutyPhase {
  if (now < windows.reviewEnd) return "review";
  if ((now >= windows.commitEnd || allCommitted) && now < windows.revealEnd) return "reveal";
  if (now < windows.commitEnd) return "commit";
  return "final";
}

/**
 * Upsert the duty for our seat in one decoded round. Reconcile scans call
 * this repeatedly — it is idempotent within a draw attempt:
 *
 * - drawn, unseen (or redrawn with us drawn again) → fresh `open` record
 *   with seat, attempt, and windows (a redraw voids the old panel's
 *   commits, so the record resets).
 * - drawn, same attempt already tracked → prior record untouched, no write
 *   (open/committed/revealed/abstained progress stands).
 * - not drawn → prior untouched; but if a redraw (attempt bump) dropped our
 *   seat, the stale record is closed as `redrawn-out` so no component
 *   retries a void duty.
 */
export async function trackRound(
  deps: { store: DutyStore; ourKey: string; now(): number; trace?: TraceSink },
  round: RoundView,
): Promise<DutyRecord | null> {
  const prior = await deps.store.load(round.dispute, round.roundIdx);
  const seat = round.jurors.slice(0, round.jurorCount).indexOf(deps.ourKey);
  const now = deps.now();

  if (seat < 0) {
    if (prior && prior.drawAttempt !== undefined && prior.drawAttempt < round.drawAttempt) {
      const superseded: DutyRecord = {
        ...prior,
        status: "abstained",
        failure: {
          kind: "redrawn-out",
          reason: `seat lost in redraw attempt ${round.drawAttempt}`,
          at: now,
        },
        updatedAt: now,
      };
      await deps.store.save(superseded);
      return superseded;
    }
    return prior ?? null;
  }

  if (prior && (prior.drawAttempt === round.drawAttempt || prior.drawAttempt === undefined)) {
    return prior;
  }

  const record: DutyRecord = {
    dispute: round.dispute,
    roundIdx: round.roundIdx,
    status: "open",
    seat,
    drawAttempt: round.drawAttempt,
    ...roundWindows(round),
    updatedAt: now,
  };
  await deps.store.save(record);
  // ADR-0037 duty-open — once per fresh draw (windows are chain seconds;
  // the trace wire is unix ms).
  deps.trace?.emit({
    kind: "duty-open",
    round: round.roundIdx,
    seat,
    reviewEnd: Number(round.reviewEnd) * 1_000,
    commitEnd: Number(round.commitEnd) * 1_000,
    revealEnd: Number(round.revealEnd) * 1_000,
  });
  return record;
}
