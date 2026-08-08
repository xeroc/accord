/**
 * disputePhase.ts — dispute phase label + countdown for the juror dashboard.
 *
 * The juror dashboard (`/juror`) shows each active draw's current phase
 * (Review / Commit / Reveal) with a countdown timer. The phase is derived
 * from the Dispute's `state` enum + the Round's window deadlines
 * (`reviewEnd`, `commitEnd`, `revealEnd`).
 *
 * Pure — no chain access. Takes already-fetched typed data.
 */

import { DisputeState } from "../generated/types/disputeState.js";

/** The Round window deadlines the phase computation needs. */
export interface RoundPhaseWindows {
  reviewEnd: bigint;
  commitEnd: bigint;
  revealEnd: bigint;
}

/** Human-readable phase + remaining seconds (null = no active countdown). */
export interface PhaseInfo {
  phase: string;
  /** Seconds remaining in the current window. `null` when past the deadline
   *  or the state has no countdown. Negative = overdue (crank pending). */
  countdownSecs: bigint | null;
}

/**
 * Derive the juror-facing phase label + countdown for a dispute.
 *
 * @param state   The Dispute's `state` field.
 * @param now     Current Unix timestamp (seconds).
 * @param round   The current Round's window deadlines (required for
 *                Review/Commit/Reveal; pass `undefined` if not yet drawn).
 */
export function disputePhase(
  state: DisputeState,
  now: bigint,
  round?: RoundPhaseWindows,
): PhaseInfo {
  switch (state) {
    case DisputeState.Created:
    case DisputeState.Drawn:
      return { phase: "Pending draw", countdownSecs: null };

    case DisputeState.Review:
      return {
        phase: "Review",
        countdownSecs: round ? round.reviewEnd - now : null,
      };

    case DisputeState.Commit:
      return {
        phase: "Commit",
        countdownSecs: round ? round.commitEnd - now : null,
      };

    case DisputeState.Reveal:
      return {
        phase: "Reveal",
        countdownSecs: round ? round.revealEnd - now : null,
      };

    case DisputeState.RoundResolved:
      return { phase: "Awaiting appeal", countdownSecs: null };

    case DisputeState.RedrawEligible:
      return { phase: "Redraw eligible", countdownSecs: null };

    case DisputeState.Final:
      return { phase: "Finalized", countdownSecs: null };

    case DisputeState.Closed:
      return { phase: "Closed", countdownSecs: null };

    case DisputeState.Failed:
      return { phase: "Failed", countdownSecs: null };

    default:
      return { phase: "Unknown", countdownSecs: null };
  }
}
