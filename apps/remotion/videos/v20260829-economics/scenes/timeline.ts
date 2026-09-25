/**
 * timeline.ts — the single source of truth for the economics video
 * (group D): scene lengths, absolute offsets, the shared concept map,
 * and the multi-tick helper that lets the pure kit counters
 * (LedgerCounter / VaultBox animate one from→to per mount) express a
 * whole sequence of ledger changes without remounting.
 *
 * Scene map (30 fps, 1920x1080, 63.0 s total):
 *   title   f0    – 105   mark draw-on · wordmark · group-D kicker
 *   D1      f105  – 435   two mints, two vaults + boxed invariants
 *   D2      f435  – 780   coherence settlement — the slash is ledger-only
 *   D3      f780  – 1080  appeal ladder + exponential cost curve
 *   D4      f1080 – 1410  final-ruling retroactive beam
 *   D5      f1410 – 1785  the juror's capital journey (airlock strip)
 *   endcard f1785 – 1890  mark · wordmark · useaccord.xyz · rule
 */

export const FPS = 30;

export const SCENE_FRAMES = {
  title: 105,
  d1: 330,
  d2: 345,
  d3: 300,
  d4: 330,
  d5: 375,
  endcard: 105,
} as const;

export const SCENE_START = {
  title: 0,
  d1: 105,
  d2: 435,
  d3: 780,
  d4: 1080,
  d5: 1410,
  endcard: 1785,
} as const;

export const DURATION_IN_FRAMES = (Object.values(SCENE_FRAMES) as number[]).reduce(
  (a, b) => a + b,
  0,
);

/** The five concepts, in play order — the shared caption row. */
export const CONCEPTS = [
  "two vaults",
  "slash ledger",
  "appeal ladder",
  "retro-beam",
  "capital journey",
] as const;

export interface Tick {
  /** frame the change fires */
  at: number;
  /** post-change value */
  to: number;
}

export function multiTick(
  frame: number,
  initial: number,
  ticks: readonly Tick[],
): { from: number; to: number; at: number } {
  let phase = -1;
  for (let i = 0; i < ticks.length; i++) {
    if (frame >= (ticks[i]?.at ?? 0)) {
      phase = i;
    }
  }
  const tick = phase >= 0 ? ticks[phase] : undefined;
  if (!tick) {
    return { from: initial, to: initial, at: -999 };
  }
  const from = phase === 0 ? initial : (ticks[phase - 1]?.to ?? initial);
  return { from, to: tick.to, at: tick.at };
}
