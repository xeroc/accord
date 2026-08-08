/**
 * v1 protocol constants and defaults.
 *
 * Sourced from `programs/accord/src/constants.rs` and AGENTS.md "v1 Defaults".
 * Per-Subaccord params are configurable at creation; these are the milestone
 * defaults.
 */

// --- Account-size bounds (constants.rs) ---

export const MAX_JURORS = 31;
export const MAX_APPEALS = 3;
export const MAX_OPTIONS = 32;

// --- Timelocks (constants.rs, in slots @ ~400ms mainnet) ---

export const UPDATE_TIMELOCK_SLOTS = 432_000n; // 48h
export const UNPAUSE_TIMELOCK_SLOTS = 216_000n; // 24h

// --- Windows (constants.rs, in seconds) ---

/** Default appeal window (ADR-0022). Per-Subaccord now; this is the
 *  `createSubaccord` default + the "v1 default" the docs cite — the runtime
 *  value is `dispute.terms.appealWindow` (frozen at filing). 3 days. */
export const DEFAULT_APPEAL_WINDOW_SECS = 259_200n;
/** Floor on the per-Subaccord appeal window (ADR-0022). 1 hour. */
export const MIN_APPEAL_WINDOW_SECS = 3_600n;

// --- Accumulator (ADR-0012) ---

/** Default Merkle accumulator tree depth. 2^20 ≈ 1M seats; per-Subaccord. */
export const DEFAULT_TREE_DEPTH = 20;

// --- v1 default economics (per-Subaccord; AGENTS.md "v1 Defaults") ---

/**
 * Round-1 juror panel size (ADR-0019). Fixed protocol constant — not
 * per-Subaccord configurable. The appeal ladder grows it via `2N+1`:
 * 3 → 7 → 15 → 31 (the last exactly fills `MAX_JURORS` at `max_appeals = 3`).
 */
export const INITIAL_NUM_JURORS = 3;
export const DEFAULT_ALPHA_BPS = 1_000; // 10%
export const DEFAULT_REVIEW_WINDOW_SECS = 604_800n; // 7 days
export const DEFAULT_COMMIT_WINDOW_SECS = 172_800n; // 2 days
export const DEFAULT_REVEAL_WINDOW_SECS = 172_800n; // 2 days
export const DEFAULT_MAX_APPEALS = 3;
/**
 * Default reveal-quorum fraction in bps (ADR-0021): 6_666 = 2/3. A round is
 * authoritative only once `reveal_count >= ceil(panel × bps / 10_000)`.
 */
export const DEFAULT_REVEAL_THRESHOLD_BPS = 6_666;
/** Program ceiling on per-round redraw attempts (bounds the redraw ladder). */
export const MAX_DRAW_ATTEMPTS = 10;
/** Default same-size redraw cap per round before a dispute fails (ADR-0021). */
export const DEFAULT_MAX_DRAW_ATTEMPTS = 3;
export const DEFAULT_MIN_STAKE = 1_000n;
export const DEFAULT_FEE_PER_JUROR = 0n; // set per-Subaccord

// --- Panel ladder: round-1 = INITIAL_NUM_JURORS (fixed 3); N_{k+1} = 2·N_k + 1,
//     closed form (J+1)·2^k − 1, capped at MAX_JURORS ---

/** Panel size for round `roundIdx` (round-1 seed is the fixed INITIAL_NUM_JURORS). */
export function panelSizeForRound(roundIdx: number): number | null {
  if (!Number.isInteger(roundIdx) || roundIdx < 0 || roundIdx >= 31) {
    return null;
  }
  const factor = 1 << roundIdx;
  const panel = (INITIAL_NUM_JURORS + 1) * factor - 1;
  if (!Number.isSafeInteger(panel) || panel < 0) return null;
  return Math.min(panel, MAX_JURORS);
}

/** Largest panel a Subaccord with `maxAppeals` configured appeals can reach. */
export function maxAppealPanelSize(maxAppeals: number): number {
  const factor = 1 << maxAppeals;
  return Math.min((INITIAL_NUM_JURORS + 1) * factor - 1, MAX_JURORS);
}
