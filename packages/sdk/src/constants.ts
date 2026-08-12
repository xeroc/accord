import type { Address } from "@solana/kit";

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

/**
 * Maximum tree depth that fits a `stake`/`requestWithdraw`/`reconcileStake`
 * instruction within the 1232-byte serialized transaction limit when signed
 * via a browser wallet. The MST proof is `depth × 40` bytes of instruction
 * data; the `stake` ix has ~490 bytes of fixed overhead (7 accounts + headers
 * + discriminator + amount). `490 + depth×40 ≤ 1232` ⇒ depth ≤ 18, but we
 * cap at 16 (102-byte margin) for safety.
 */
export const MAX_SAFE_TREE_DEPTH = 16;

/**
 * Default Merkle accumulator tree depth. 2^16 = 65,536 seats; per-Subaccord.
 * Capped at {@link MAX_SAFE_TREE_DEPTH} so browser-wallet signing works.
 */
export const DEFAULT_TREE_DEPTH = 16;

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

// --- Panel ladder: round-1 = min_jury_size (per-Subaccord, accord-9q3e; default
//     INITIAL_NUM_JURORS); N_{k+1} = 2·N_k + 1, closed form (J+1)·2^k − 1,
//     capped at MAX_JURORS ---

/**
 * Panel size for round `roundIdx`, seeded by `baseJurySize` (the Subaccord's
 * `min_jury_size`). Defaults to {@link INITIAL_NUM_JURORS} (=3) for backward
 * compatibility — pass the Subaccord's value explicitly for non-default pools.
 */
export function panelSizeForRound(
  roundIdx: number,
  baseJurySize: number = INITIAL_NUM_JURORS,
): number | null {
  if (
    !Number.isInteger(roundIdx) ||
    roundIdx < 0 ||
    roundIdx >= 31 ||
    !Number.isInteger(baseJurySize) ||
    baseJurySize < 1
  ) {
    return null;
  }
  const factor = 1 << roundIdx;
  const panel = (baseJurySize + 1) * factor - 1;
  if (!Number.isSafeInteger(panel) || panel < 0) return null;
  return Math.min(panel, MAX_JURORS);
}

/**
 * Largest panel a Subaccord with `maxAppeals` appeals can reach, seeded by
 * `baseJurySize` (the Subaccord's `min_jury_size`). Defaults to
 * {@link INITIAL_NUM_JURORS} (=3).
 */
export function maxAppealPanelSize(
  maxAppeals: number,
  baseJurySize: number = INITIAL_NUM_JURORS,
): number {
  const factor = 1 << maxAppeals;
  return Math.min((baseJurySize + 1) * factor - 1, MAX_JURORS);
}

// --- MagicBlock VRF oracle queues (ephemeral_rollups_sdk::vrf::consts) ---
//
// Every randomness request names an oracle queue. A delegated queue is writable
// only from inside an ephemeral rollup; a non-delegated (base-layer) queue is
// writable on L1. The cranker and Arbitrables run on L1, so they reference the
// base-layer queue. Mainnet and devnet share the same addresses.
//
// @see https://docs.magicblock.dev

/** Mainnet/devnet base-layer VRF oracle queue (`DEFAULT_QUEUE`). */
export const VRF_ORACLE_QUEUE =
  "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh" as Address;
/** Mainnet/devnet delegated (ephemeral rollup) VRF oracle queue (`DEFAULT_EPHEMERAL_QUEUE`). */
export const VRF_ORACLE_EPHEMERAL_QUEUE =
  "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc" as Address;
/** Localnet base-layer test VRF oracle queue (`DEFAULT_TEST_QUEUE`). */
export const VRF_ORACLE_TEST_QUEUE =
  "GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb" as Address;
/** Localnet delegated (ephemeral rollup) test VRF oracle queue (`DEFAULT_EPHEMERAL_TEST_QUEUE`). */
export const VRF_ORACLE_EPHEMERAL_TEST_QUEUE =
  "Sc9MJUngNbQXSXGP3F67KvKwVnhaYn6kcioxXNVowYT" as Address;
