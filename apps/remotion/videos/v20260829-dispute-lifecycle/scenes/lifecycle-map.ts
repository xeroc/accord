/**
 * lifecycle-map.ts — B1's whole choreography as pure data + math.
 *
 * The scene is a two-row serpentine state machine (exact DisputeState
 * names from programs/accord/src/state.rs):
 *
 *   row 1   Created → Drawn → Review → Commit      (left → right)
 *   sweep   Commit ↷ right-edge U-turn ↙ midline ↘ Reveal
 *   row 2   Reveal → RoundResolved → Final → Closed (left → right)
 *
 * The appeal loop rises vertically from RoundResolved back to Drawn;
 * RedrawEligible / Failed hang below Reveal as dashed side exits.
 * The token rides the spine; StateNodes ignite on arrival. Rulers
 * (tick strips) carry the time windows, gears the permissionless
 * crank edges, chips the acting party.
 */

// ---------------------------------------------------------------------------
// Layout — one absolute coordinate system on the 1920×1080 canvas.
// ---------------------------------------------------------------------------

export const ROW1_Y = 400;
export const ROW2_Y = 760;
export const BRANCH_Y = 940;

export const COL = { c1: 270, c2: 780, c3: 1270, c4: 1690 } as const;

export interface NodeSpec {
  label: string;
  x: number;
  y: number;
  /** frame the station enters the diagram */
  at: number;
  /** frame it ignites (token arrival) */
  activeAt?: number;
  /** frame it relaxes to "visited" (token departure) */
  settleAt?: number;
  settleTo?: "visited" | "baseline";
}

export const NODES: NodeSpec[] = [
  { label: "Created", x: COL.c1, y: ROW1_Y, at: 2, activeAt: 18, settleAt: 30 },
  { label: "Drawn", x: COL.c2, y: ROW1_Y, at: 4, activeAt: 51, settleAt: 60 },
  { label: "Review", x: COL.c3, y: ROW1_Y, at: 6, activeAt: 90, settleAt: 99 },
  { label: "Commit", x: COL.c4, y: ROW1_Y, at: 8, activeAt: 121, settleAt: 129 },
  { label: "Reveal", x: COL.c1, y: ROW2_Y, at: 10, activeAt: 171, settleAt: 174 },
  {
    label: "RoundResolved",
    x: COL.c2,
    y: ROW2_Y,
    at: 12,
    activeAt: 187,
    settleAt: 272,
  },
  { label: "Final", x: COL.c3, y: ROW2_Y, at: 14, activeAt: 286, settleAt: 306 },
  { label: "Closed", x: COL.c4, y: ROW2_Y, at: 16, activeAt: 320 },
  // side exits — never ignited on the happy path, pulsed once at the tally
  { label: "RedrawEligible", x: COL.c1, y: BRANCH_Y, at: 18 },
  { label: "Failed", x: 640, y: BRANCH_Y, at: 20 },
];

// ---------------------------------------------------------------------------
// The spine — sampled polyline + arc pieces the token rides.
// ---------------------------------------------------------------------------

interface Piece {
  /** SVG path fragment (concatenated == the base spine drawing) */
  d: string;
  len: number;
  sample: (t: number) => { x: number; y: number };
}

function line(x1: number, y1: number, x2: number, y2: number): Piece {
  return {
    d: `M ${x1} ${y1} L ${x2} ${y2}`,
    len: Math.hypot(x2 - x1, y2 - y1),
    sample: (t) => ({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }),
  };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number): Piece {
  const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
  const p1 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return {
    d: `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r} ${r} 0 ${large} ${sweep} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
    len: Math.abs(a1 - a0) * r,
    sample: (t) => ({
      x: cx + r * Math.cos(a0 + (a1 - a0) * t),
      y: cy + r * Math.sin(a0 + (a1 - a0) * t),
    }),
  };
}

const PIECES = [
  line(COL.c1, ROW1_Y, COL.c2, ROW1_Y), // P0 Created → Drawn (crank · draw)
  line(COL.c2, ROW1_Y, COL.c3, ROW1_Y), // P1 review window
  line(COL.c3, ROW1_Y, COL.c4, ROW1_Y), // P2 commit window
  line(COL.c4, ROW1_Y, 1810, ROW1_Y), // P3 sweep: exit right
  arc(1810, 480, 80, -Math.PI / 2, Math.PI / 2), // P4 sweep: U-turn
  line(1810, 560, COL.c1, 560), // P5 sweep: midline (reveal window)
  line(COL.c1, 560, COL.c1, ROW2_Y), // P6 sweep: drop into Reveal
  line(COL.c1, ROW2_Y, COL.c2, ROW2_Y), // P7 finalize_round
  line(COL.c2, ROW2_Y, COL.c3, ROW2_Y), // P8 appeal window
  line(COL.c3, ROW2_Y, COL.c4, ROW2_Y), // P9 settle
] as const satisfies readonly Piece[];

const CUM: number[] = PIECES.reduce<number[]>(
  (acc, p, i) => [...acc, (acc[i - 1] ?? 0) + p.len],
  [],
);
export const PATH_LEN = CUM[CUM.length - 1] ?? 0;

/** Position at a distance along the spine (clamped). */
export function posAt(dist: number): { x: number; y: number } {
  const d = Math.min(PATH_LEN, Math.max(0, dist));
  let start = 0;
  let last: Piece | undefined;
  for (const piece of PIECES) {
    last = piece;
    if (d <= start + piece.len) {
      return piece.sample((d - start) / piece.len);
    }
    start += piece.len;
  }
  return last ? last.sample(1) : { x: 0, y: 0 };
}

/** The Commit→Reveal sweep as one path (U-turn + midline + drop). */
export const SWEEP_D = `M ${COL.c4} ${ROW1_Y} L 1810 ${ROW1_Y} A 80 80 0 0 1 1810 560 L ${COL.c1} 560 L ${COL.c1} ${ROW2_Y}`;

/** The base spine as one SVG path (drawn dim, currentColor). */
export const SPINE_D = PIECES.map((p) => p.d).join(" ");

// ---------------------------------------------------------------------------
// Token beats — distance along the spine per frame window.
// ---------------------------------------------------------------------------

export interface TokenBeat {
  from: number;
  to: number;
  d0: number;
  d1: number;
  linear?: boolean;
}

export const TOKEN_BEATS: TokenBeat[] = [
  { from: 0, to: 18, d0: 0, d1: 0 }, // pre-ignite
  { from: 18, to: 30, d0: 0, d1: 0 }, // ignite at Created
  { from: 30, to: 51, d0: 0, d1: 510 }, // crank · draw (VRF)
  { from: 51, to: 60, d0: 510, d1: 510 },
  { from: 60, to: 90, d0: 510, d1: 1000, linear: true }, // review crawl
  { from: 90, to: 99, d0: 1000, d1: 1000 },
  { from: 99, to: 121, d0: 1000, d1: 1420, linear: true }, // commit crawl
  { from: 121, to: 129, d0: 1420, d1: 1420 },
  { from: 129, to: 171, d0: 1420, d1: 3531, linear: true }, // reveal sweep
  { from: 171, to: 174, d0: 3531, d1: 3531 },
  { from: 174, to: 187, d0: 3531, d1: 4041 }, // finalize_round
  { from: 187, to: 272, d0: 4041, d1: 4041 }, // appeal hold (bounce)
  { from: 272, to: 286, d0: 4041, d1: 4531 }, // finalize_dispute
  { from: 286, to: 306, d0: 4531, d1: 4531 },
  { from: 306, to: 320, d0: 4531, d1: 4951 }, // settle
  { from: 320, to: 9e9, d0: 4951, d1: 4951 }, // parked at Closed
];

/** Lit-path overlay segments: [d, window, linear?] — amber draws as the token crosses. */
export const LIT_SEGMENTS: Array<{ d: string; from: number; to: number; linear?: boolean }> = [
  { d: PIECES[0].d, from: 30, to: 51 },
  { d: PIECES[1].d, from: 60, to: 90, linear: true },
  { d: PIECES[2].d, from: 99, to: 121, linear: true },
  { d: SWEEP_D, from: 129, to: 171, linear: true },
  { d: PIECES[7].d, from: 174, to: 187 },
  { d: PIECES[8].d, from: 272, to: 286 },
  { d: PIECES[9].d, from: 306, to: 320 },
];

// ---------------------------------------------------------------------------
// The appeal loop — vertical up-edge RoundResolved → Drawn.
// ---------------------------------------------------------------------------

export const APPEAL_X = 785;
export const APPEAL_SEGMENTS = [
  { y0: 736, y1: 592 }, // below the midline crossing gap
  { y0: 548, y1: 428 }, // above it, arrowing into Drawn
];
export const APPEAL_DRAW = { from: 196, to: 217 };
export const GHOST = { from: 232, to: 260, dissolveFrom: 260, dissolveTo: 268, rippleAt: 258 };

// ---------------------------------------------------------------------------
// Rulers — the time windows. Tick counts carry the relative lengths.
// ---------------------------------------------------------------------------

export interface RulerSpec {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  ticks: number;
  at: number;
  dur: number;
  /** anchor the label at the right end (midline ruler) */
  labelAtRight?: boolean;
}

export const RULERS: RulerSpec[] = [
  { id: "review", label: "review", x: 830, y: 448, width: 400, ticks: 8, at: 60, dur: 30 },
  { id: "commit", label: "commit", x: 1330, y: 448, width: 300, ticks: 6, at: 99, dur: 22 },
  { id: "reveal", label: "reveal", x: 300, y: 580, width: 1480, ticks: 7, at: 129, dur: 42, labelAtRight: true },
  { id: "appeal", label: "appeal · 3d", x: 830, y: 808, width: 400, ticks: 16, at: 196, dur: 72 },
];

// ---------------------------------------------------------------------------
// Gears — permissionless crank edges. Rotation steps in 15° increments.
// ---------------------------------------------------------------------------

export interface GearSpec {
  id: string;
  x: number;
  y: number;
  from: number;
  to: number;
}

export const GEARS: GearSpec[] = [
  { id: "draw", x: 525, y: ROW1_Y, from: 30, to: 51 },
  { id: "finalize_round", x: 525, y: ROW2_Y, from: 174, to: 187 },
  { id: "finalize_dispute", x: 1025, y: ROW2_Y, from: 272, to: 286 },
  { id: "settle", x: 1480, y: ROW2_Y, from: 306, to: 320 },
  { id: "redraw", x: 128, y: 700, from: 187, to: 205 },
];

// ---------------------------------------------------------------------------
// Actor chips — who flips the switch. Transient (enter, hold ~1.4s, exit).
// ---------------------------------------------------------------------------

export interface ChipSpec {
  text: string;
  tone: "amber" | "confirm" | "neutral";
  x: number;
  y: number;
  at: number;
  exit: number;
  /** right-align the chip at x (appeal chip sits left of the loop edge) */
  anchorRight?: boolean;
}

export const CHIPS: ChipSpec[] = [
  { text: "Arbitrable · create_dispute", tone: "amber", x: COL.c1, y: 348, at: 21, exit: 78 },
  { text: "cranker · draw (VRF)", tone: "neutral", x: 525, y: 348, at: 33, exit: 84 },
  { text: "evidence", tone: "neutral", x: COL.c3, y: 348, at: 90, exit: 132 },
  { text: "juror · commit", tone: "neutral", x: 1480, y: 348, at: 101, exit: 150 },
  { text: "juror · reveal", tone: "neutral", x: 1560, y: 512, at: 133, exit: 182 },
  { text: "cranker · finalize_round", tone: "neutral", x: 490, y: 706, at: 176, exit: 222 },
  { text: "appellant · appeal (+bond)", tone: "amber", x: 762, y: 462, at: 205, exit: 268, anchorRight: true },
  { text: "cranker · finalize_dispute", tone: "neutral", x: 1025, y: 706, at: 274, exit: 320 },
  { text: "cranker · settle", tone: "neutral", x: 1480, y: 706, at: 308, exit: 352 },
];

// Static map labels for the dashed side exits (no chip chrome).
export const BRANCH_LABELS = [
  { text: "shortfall / tie", x: 296, y: 850 },
  { text: "cranker · redraw", x: COL.c1, y: 988 },
  { text: "attempts exhausted / cancel", x: 478, y: 900 },
];

export const BRANCH_PULSE = { from: 187, to: 199 };

// Micro-beats: envelope glyphs + tally/ruling/check badges.
export const ENVELOPE = {
  commitDrop: { x: 1600, from: 108, to: 121, y0: 330, y1: 388 },
  revealOpen: { x: 192, y: ROW2_Y, at: 171 },
};
export const SEATS = { y: 356, xs: [740, 782, 824], at: 54, stagger: 2 };
export const TALLY_CHIP = { at: 189, x: 690, y: 706 };
export const RULING = { at: 292, x: COL.c3, y: 648 };
export const LADDER = { at: 213, x: 830, y: 596 };
export const CHECK = { at: 320, x: COL.c4, y: 696 };
export const END_GLOW = { from: 330, to: 390 };

// ---------------------------------------------------------------------------
// Phase chrome — StepRail steps + PhaseCaptions actors.
export const PHASES = [
  { label: "FILE", frames: 30 },
  { label: "DRAW", frames: 30 },
  { label: "REVIEW", frames: 36 },
  { label: "COMMIT", frames: 30 },
  { label: "REVEAL", frames: 48 },
  { label: "TALLY", frames: 16 },
  { label: "APPEAL", frames: 82 },
  { label: "FINAL", frames: 48 },
  { label: "CLOSE", frames: 70 },
] as const;

export const ACTORS = [
  "arbitrable",
  "cranker",
  "window",
  "juror",
  "juror",
  "cranker",
  "appellant",
  "cranker",
  "cranker",
] as const;

/** Index of the phase active at `frame` (scene-local frame). */
export function phaseAt(frame: number): number {
  let acc = 0;
  let idx = 0;
  for (const phase of PHASES) {
    acc += phase.frames;
    if (frame < acc) return idx;
    idx++;
  }
  return PHASES.length - 1;
}
