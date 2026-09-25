/**
 * timeline.ts — the single source of truth for the group-C explainer
 * (randomness & the draw). Linear adaptation of the loop storyboards in
 * concept-illustrations/C-draw.proposal.md: every beat plays once and
 * the loops' reset breaths become end-holds.
 *
 * Scenes (30 fps):
 *   title  105 f  (3.5 s)   family title
 *   c1     330 f  (11.0 s)  stake-weighted sortition — the number line
 *   c2     345 f  (11.5 s)  the MST accumulator — root on-chain
 *   c3     495 f  (16.5 s)  VRF delivery + root freeze — the timing
 *   end     90 f  (3.0 s)   family endcard
 */

export const FPS = 30;

export const SCENE_FRAMES = {
  title: 105,
  c1: 330,
  c2: 345,
  c3: 495,
  end: 90,
} as const;

export const DURATION_IN_FRAMES =
  SCENE_FRAMES.title +
  SCENE_FRAMES.c1 +
  SCENE_FRAMES.c2 +
  SCENE_FRAMES.c3 +
  SCENE_FRAMES.end; // 1365 f ≈ 45.5 s

// ---------------------------------------------------------------------------
// C1 — stake-weighted sortition (the number line)
// ---------------------------------------------------------------------------

/** The pool: five jurors, stake-proportional ruler segments. */
export const C1_STAKES = [120, 80, 450, 250, 100] as const;
export const C1_LABELS = ["P", "Q", "R", "S", "T"] as const;
export const C1_TOTAL = C1_STAKES.reduce((s, w) => s + w, 0); // 1000
/** Segment ranges in stake units: prefix ≤ r < prefix + stake. */
export const C1_RANGE: ReadonlyArray<[number, number]> = (() => {
  const out: Array<[number, number]> = [];
  let prefix = 0;
  for (const w of C1_STAKES) {
    out.push([prefix, prefix + w]);
    prefix += w;
  }
  return out;
})();

/** VRF-derived landing points (r₀ wins R, r₂ collides in R, r₁ wins S). */
export const C1_R0 = 290;
export const C1_R2 = 538;
export const C1_R1 = 773;

export const T1 = {
  at: 4, // ruler assembles (baseline + segment cascade)
  seatsAt: 48, // empty seat slots fade in
  sweepAt: 56, // density wave crosses (probability made physical)
  vrfChipAt: 66, // committed_vrf chip materializes
  dartPin: 70, // dart fades in pinned at the r=0 end
  hexLock1: 84, // hex nibbles lock
  capR0At: 76, // caption: r₀ = vrf % total_stake
  throw1: 92, // dart 1 departs
  land1: 104, // dart 1 lands inside R (settle + drop-needle)
  win1: 108, // R tint sweep
  capPrefixRAt: 112, // prefix-math caption under R
  coin1At: 118, // R's juror token arcs into seat 1
  hatchR: 142, // R hatch — drawn / excluded
  tagRAt: 146,
  capPrefixROut: 152,
  throw2: 158, // dart 2 (compressed repeat) departs
  land2: 168, // dart 2 lands inside R's hatched range
  flash2: 170, // one flat amber flash — collision, no shake
  collisionTagAt: 171,
  attemptTick: 172, // draw_attempt odometer 0 → 1
  dissolve2: 178, // dart 2 dissolves
  reflick: 184, // hex nibbles re-flicker (re-derivation)
  hexLock2: 196,
  capR1At: 190, // caption: r₁ = vrf ⊕ draw_attempt % total_stake
  throw3: 200, // dart r₁ departs
  land3: 212, // lands inside S
  win2: 216, // S tint sweep
  capPrefixSAt: 220,
  coin2At: 226, // S's juror token arcs into seat 2
  hatchS: 250, // S hatch (scene-local wipe)
  tagSAt: 254,
  capPrefixSOut: 260,
  holdAt: 264, // final caption holds to the cut
} as const;

// ---------------------------------------------------------------------------
// C2 — the MST accumulator (root on-chain, tree off-chain)
// ---------------------------------------------------------------------------

/** Leaf stakes; index 3 takes the +20 stake event, index 6 the −16 unstake. */
export const C2_LEAVES = [120, 80, 140, 60, 200, 160, 90, 150] as const;
export const C2_TOTAL_0 = C2_LEAVES.reduce((s, w) => s + w, 0); // 1000

export const T2 = {
  at: 6, // tree draws root-first; card drops in
  cardAt: 8,
  dividerAt: 18,
  chip1At: 40, // stake +Δ arcs into leaf 3
  chip1Land: 54,
  update1At: 54, // hop 0: leaf 3 glows + odometers 60 → 80
  frostAt: 62, // off-path nodes frost out (staging beat)
  frozenTagAt: 66,
  hop1: 15, // hops at 54 · 69 · 84 · 99 — root lands on the final hop
  rootHashLock: 101, // on-chain root_hash scrambles to the new hex
  stakeTick1: 103, // total_stake 1,000 → 1,020 (80 ms after the root hop)
  checkAt: 118, // canonical ✓ stroke-draws
  ologAt: 124, // O(log N) caption chip
  chip2At: 150, // unstake −Δ arcs into leaf 6 (compressed repeat)
  chip2Land: 164,
  update2At: 164, // event 2 at ~0.6× timing: hopDur 9 → 164 · 173 · 182 · 191
  rootHashRe2: 193, // root_hash re-scrambles
  stakeTick2: 195, // total_stake 1,020 → 1,004
  rootHashLock2: 203,
  insetAt: 232, // historical contrast inset rises
  bondAt: 240,
  fraudAt: 244,
  strikeAt: 252, // strike-line wipes across bond + fraud window
  insetDimAt: 266, // the old model dims to 40%
  insetCapAt: 272,
  holdAt: 292,
} as const;

// ---------------------------------------------------------------------------
// C3 — VRF delivery + root freeze (the manipulation-proof timing)
// ---------------------------------------------------------------------------

export const T3 = {
  axisAt: 6, // time axis draws L→R
  laneAt: 10, // lifelines stagger: 10 · 14 · 18
  t0At: 26,
  reqAt: 36, // request_vrf arrow draws (cranker → oracle)
  pressAt: 44, // cranker chip press-squash (it pays)
  entropyAt: 60, // entropy glyph spins + decelerates
  rChipAt: 70, // chip: r = ?????? (the tension beat)
  cbAt: 102, // commit_vrf_callback arrow draws (oracle → Accord)
  glowCharge: 108, // pre-drop glow charge on the freeze column
  // HARD RULE 1 (atomicity): the committed_vrf stamp and the freeze-line
  // drop begin ONE frame apart (33 ms ≤ 80 ms) — same write, one instruction.
  stampAt: 114, // committed_vrf stamps into the Accord lane
  freezeDropAt: 115, // freeze line drops top→bottom (the Premium reveal)
  freezeLandAt: 127, // line lands —
  tintAt: 127, // crystalline tint + root lock + frost
  lockAt: 127,
  // HARD RULE 2: the entropy glyph's rotation halts on this exact frame.
  capAtomAt: 131,
  capFreezeAt: 138,
  seatAt: 162, // draw_seat × 3 march along the frozen root (10 f apart)
  disputeAt: 168, // the dispute chip rides the Accord lane
  bracketAAt: 222, // window A bracket
  ghostAAt: 232, // adversary descends top-left
  attackAAt: 248, // stake Δ fires at the accumulator (straight, angular)
  miniAt: 258, // mini number line appears (the C1 callback)
  reshape1: 266, // segments reshape (widths shuffle)
  reshape2: 282, // …and again — the dart stays veiled
  dissolveA: 300, // arrow + reshaped ruler dissolve
  aimTagAt: 310, // "can aim at nothing"
  bracketBAt: 318, // window B bracket
  ghostBAt: 328, // adversary descends top-right — now r is known
  attackBAt: 342, // stake Δ travels toward the frozen root
  hitB: 354, // strikes the freeze plane: flash + deflect down the glass
  noopTagAt: 366,
  footnoteAt: 374,
  silenceAt: 402, // oracle lane goes quiet: ···
  ringAt: 408, // timeout ring fills (700 ms)
  cancelAt: 432, // cancel_dispute flies cranker → dispute
  refundAt: 446, // refund chip pops
  capLiveAt: 452,
} as const;
