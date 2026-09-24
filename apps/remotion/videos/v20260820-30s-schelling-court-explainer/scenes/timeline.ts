/**
 * timeline.ts — the single source of truth for the schelling-court
 * choreography. Illustration-only cut (rev 2): no title slide, no chrome —
 * one beat word above the stage; the pool pops its five jurors (no
 * scan/shimmer), fades away, and the camera zooms into the jury; the
 * incoherent vote is crossed out (no falling shards). Rev 3 appends a 3s
 * domain endcard (mark · wordmark · useaccord.xyz) after the take.
 *
 * Phases (30fps):
 *   draw   0    – 105   pool pops five jurors; pool fades; zoom in
 *   commit 105  – 210   hash(vote, salt) seals land per juror
 *   reveal 210  – 315   chips flip to votes; tally assembles
 *   fee    315  – 405   filing fee pays every drawn juror
 *   slash  405  – 495   incoherent vote crossed out; stake slashed
 *   profit 495  – 600   pot redistributes to the coherent majority
 *   ruling 600  – 750   the majority option stamps in as the Ruling
 */

export const FPS = 30;
export const COURT_FRAMES = 750; // 25s — the continuous take
export const ENDCARD_FRAMES = 90; // 3s — the domain sign-off
export const DURATION_IN_FRAMES = COURT_FRAMES + ENDCARD_FRAMES; // 28s

export const T = {
  draw: 0,
  commit: 105,
  reveal: 210,
  fee: 315,
  slash: 405,
  profit: 495,
  ruling: 600,
} as const;

export type Phase = keyof typeof T;

/** The seven mechanism beats, in order. */
export const STEPS: Phase[] = [
  "draw",
  "commit",
  "reveal",
  "fee",
  "slash",
  "profit",
  "ruling",
];

/** One-word headline shown above the illustration. */
export const HEADLINE: Record<Phase, string> = {
  draw: "DRAW",
  commit: "COMMIT",
  reveal: "REVEAL",
  fee: "FEE",
  slash: "SLASH",
  profit: "PROFIT",
  ruling: "RULING",
};

/** The jury. Index 2 is the incoherent minority — center screen. */
export interface JurorCast {
  short: string;
  hash: string;
  poolDot: number;
  vote: "YES" | "NO";
  coherent: boolean;
}

export const JURORS: JurorCast[] = [
  { short: "7f2a", hash: "6f3a91c2", poolDot: 4, vote: "YES", coherent: true },
  { short: "b81c", hash: "c07d24ae", poolDot: 11, vote: "YES", coherent: true },
  { short: "e49d", hash: "9b1e58f0", poolDot: 17, vote: "NO", coherent: false },
  { short: "c36b", hash: "3d94b761", poolDot: 22, vote: "YES", coherent: true },
  { short: "9a5e", hash: "e2c80b45", poolDot: 27, vote: "YES", coherent: true },
];

export const POOL_SIZE = 30;

/** Per-juror staggered beats, in frames, derived from the phase table. */
export const BEAT = {
  poolIn: 0,
  drawAt: (i: number) => 24 + i * 6, // dots pop + cards materialize
  poolFade: 78, // pool fully gone by 96 — selection is done
  zoomAt: 82, // camera 0.85 -> 1.12 over 24f, into the jury
  commitAt: (i: number) => 117 + i * 10,
  revealAt: (i: number) => 222 + i * 9,
  tallyGrow: 262,
  vaultIn: 318,
  feeCoinAt: (i: number) => 330 + i * 4,
  slashAt: 405, // shake lands
  crossAt: 415, // X strokes draw [415,423] and [421,429]
  stakeShrinkAt: 420, // incoherent bar 100 -> 60 over 20f
  potIn: 442,
  profitCoinAt: (i: number) => 510 + i * 5,
  profitChipAt: (i: number) => 528 + i * 5,
  stampAt: 615,
};

/** Absolute layout (1920x1080 canvas, one coordinate system for arcs). */
export const LAYOUT = {
  cardW: 292,
  cardH: 208,
  cardGap: 25,
  juryY: 250,
  headlineY: 92,
  vaultY: 185,
  tallyY: 512,
  potY: 648,
};

export const cardX = (i: number) =>
  (1920 - (5 * LAYOUT.cardW + 4 * LAYOUT.cardGap)) / 2 + i * (LAYOUT.cardW + LAYOUT.cardGap);

export const cardCenterX = (i: number) => cardX(i) + LAYOUT.cardW / 2;

/** Camera: zoom origin pinned to the jury center. */
export const ZOOM_ORIGIN = "960px 354px";

/** Economics on screen: fee 125 split 5×25; slash 40 split 4×10. */
export const ECON = {
  feeTotal: 125,
  feeEach: 25,
  slashTotal: 40,
  profitEach: 10,
};
