/**
 * State resolver — pure mapping from a decoded (Dispute, Round) snapshot to the
 * next permissionless crank action, or `null` when the dispute is waiting on a
 * time window or a user action (commit / reveal / appeal).
 *
 * Contract (milestone accord-27r5 §4): the reconciler fetches the current Round
 * (or a prior Round for settlement) and calls {@link resolveNextAction}; the
 * returned action, if any, is dispatched to the matching crank file. No side
 * effects here — pure logic over decoded SDK accounts, unit-testable.
 *
 * Coverage: the 7 dispute-lifecycle cranks derivable from (dispute, round, now) —
 * `request_vrf`, `draw_seat`, `finalize_round`, `finalize_dispute`,
 * `settle_round`, `cancel_dispute`, `redraw`. The slot-based timelock cranks
 * (`execute_subaccord_update`, `execute_unpause`) and `claim_appeal_refund`
 * read different account families (PendingUpdate / AccordState / AppealBond) on
 * a slot clock, so they are resolved by separate functions over their own
 * inputs — this signature cannot compute them.
 *
 * Gates mirror the on-chain instructions exactly
 * (programs/accord/src/lib.rs); `now` is a Unix-seconds timestamp matching
 * `Clock::get().unix_timestamp`.
 */
import { isNone } from "@solana/kit";
import { DisputeState, panelSizeForRound, type Dispute, type Round } from "@useaccord/sdk";

/** Pre-draw stall timeout before a `Created` dispute may be cancelled (constants.rs). */
const PRE_DRAW_CANCEL_TIMEOUT_SECS = 259_200n; // 3 days
/** Grace past `revealEnd + appealWindow` before a drawn dispute may be cancelled (constants.rs). */
const POST_DRAW_CANCEL_GRACE_SECS = 259_200n; // 3 days

export type CrankAction =
  | { readonly kind: "request_vrf" }
  | { readonly kind: "draw_seat"; readonly seat: number }
  | { readonly kind: "finalize_round" }
  | { readonly kind: "finalize_dispute" }
  | { readonly kind: "settle_round"; readonly roundIdx: number }
  | { readonly kind: "cancel_dispute" }
  | { readonly kind: "redraw" };

/**
 * Resolve the next crank action for a (dispute, round) snapshot, or `null` when
 * waiting. `round` is `null` when the Round account does not yet exist (e.g. VRF
 * just committed, no seat drawn yet) — treated as 0 seats drawn.
 */
export function resolveNextAction(
  dispute: Dispute,
  round: Round | null,
  now: bigint,
): CrankAction | null {
  // --- Final: settle any prior unsettled round; the final round is settled by
  //     finalize_dispute itself, so only prior rounds need a crank. ---
  if (dispute.state === DisputeState.Final) {
    if (round !== null && round.roundIdx < dispute.currentRound && round.settled === 0) {
      return { kind: "settle_round", roundIdx: round.roundIdx };
    }
    return null;
  }

  // --- Terminal: nothing to crank ---
  if (dispute.state === DisputeState.Closed || dispute.state === DisputeState.Failed) {
    return null;
  }

  // --- RedrawEligible: reconvene the panel immediately (reveal shortfall) ---
  if (dispute.state === DisputeState.RedrawEligible) {
    return { kind: "redraw" };
  }

  // --- Created: pre-draw cancel / request_vrf / draw_seat ---
  if (dispute.state === DisputeState.Created) {
    // Liveness escape: past the pre-draw timeout, cancel (dead VRF oracle or a
    // draw that never proceeds). Checked before request_vrf so a stalled oracle
    // doesn't loop the cranker forever.
    if (now > dispute.filedAt + PRE_DRAW_CANCEL_TIMEOUT_SECS) {
      return { kind: "cancel_dispute" };
    }
    if (isNone(dispute.committedVrf)) {
      return { kind: "request_vrf" };
    }
    // VRF committed: fill the panel one seat at a time. Each draw_seat is its
    // own tx (1232-byte limit); the last seat transitions state → Drawn.
    const panel = panelSizeForRound(dispute.currentRound);
    if (panel === null) return null;
    const seatsDrawn = round?.jurorCount ?? 0;
    if (seatsDrawn < panel) {
      return { kind: "draw_seat", seat: seatsDrawn };
    }
    return null;
  }

  // --- Voting phase (Drawn | Commit | Reveal): finalize_round at reveal_end,
  //     cancel only after the post-draw grace expires. ---
  if (
    dispute.state === DisputeState.Drawn ||
    dispute.state === DisputeState.Commit ||
    dispute.state === DisputeState.Reveal
  ) {
    if (round === null) return null;
    if (now > round.revealEnd + dispute.terms.appealWindow + POST_DRAW_CANCEL_GRACE_SECS) {
      return { kind: "cancel_dispute" };
    }
    // Finalize at `revealEnd`, OR once the panel has fully revealed (early
    // resolve — mirrors the on-chain finalize_round gate). The `jurorCount > 0`
    // guard avoids the degenerate 0==0 empty-panel match; the last reveal
    // writes only the Round, so the poll catches it within one cycle.
    if (
      now >= round.revealEnd ||
      (round.jurorCount > 0 && round.revealCount === round.jurorCount)
    ) {
      return { kind: "finalize_round" };
    }
    return null; // review/commit/reveal windows still open
  }

  // --- RoundResolved: finalize_dispute once the appeal window closes; cancel
  //     only after the post-draw grace expires (finalize had its chance). ---
  if (dispute.state === DisputeState.RoundResolved) {
    if (round === null) return null;
    if (now > round.revealEnd + dispute.terms.appealWindow + POST_DRAW_CANCEL_GRACE_SECS) {
      return { kind: "cancel_dispute" };
    }
    if (now >= round.revealEnd + dispute.terms.appealWindow) {
      return { kind: "finalize_dispute" };
    }
    return null; // appeal window open — waiting on a user appeal
  }

  // Review is in the enum but no instruction assigns it; unreachable.
  return null;
}
