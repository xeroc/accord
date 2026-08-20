import { useCurrentFrame, useVideoConfig } from "remotion";
import { Easing, interpolate } from "remotion";

import { clamp, enterAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { Scene } from "../../../src/shell/scene";
import { PanelLadder } from "@useaccord/ui";

import { CoinStack, ConceptChrome } from "./pieces";

/**
 * D3 · The appeal ladder — exponential anti-bribery. PanelLadder's
 * compressing entrances (the tempo IS the exponent) climb 3 → 7 → 15
 * while the bond stacks double 2 → 4 → 8 → 16; then the hero beat:
 * the cost curve draws over the staircase — slow crawl, explosive
 * rise — crosses the dashed "value of capturing the ruling" line with
 * a flash + ✕, and exits the top. Two exhaustion facts close.
 */

/**
 * The curve overlay's coordinate frame: a 560x600 box whose baseline
 * (the ladder's floor) sits at local y = 330. Heights are measured
 * above the baseline.
 */
const BOX_W = 560;
const BOX_H = 600;
const BASELINE = 330;
const LADDER_LEFT = 88;
const STEP_W = 96;
const DASH_H = 210;
const DASH_Y = BASELINE - DASH_H;

/** Anchors: height above baseline at each rung center, then the exit. */
const ANCHORS: readonly { x: number; h: number }[] = [
  { x: LADDER_LEFT + 48, h: 40 },
  { x: LADDER_LEFT + 144, h: 110 },
  { x: LADDER_LEFT + 240, h: 190 },
  { x: LADDER_LEFT + 336, h: 330 },
  { x: 540, h: 440 },
];

const IN_CUBIC = Easing.bezier(0.32, 0, 0.67, 0);
const OUT_EXPO = Easing.bezier(0.16, 1, 0.3, 1);

/** Curve heights between anchors — smoothstep keeps it monotone. */
function heightAt(x: number): number {
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i];
    const b = ANCHORS[i + 1];
    if (!a || !b) {
      continue;
    }
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      const s = t * t * (3 - 2 * t);
      return a.h + (b.h - a.h) * s;
    }
  }
  return ANCHORS[ANCHORS.length - 1]?.h ?? 440;
}

/** Sampled polyline + cumulative-length fractions (for the crossing). */
const SAMPLES: readonly { x: number; y: number; frac: number }[] = (() => {
  const pts: { x: number; y: number; len: number }[] = [];
  for (let x = ANCHORS[0]?.x ?? 136; x <= 540; x += 2) {
    pts.push({ x, y: BASELINE - heightAt(x), len: 0 });
  }
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[i - 1];
    if (!p || !q) {
      continue;
    }
    total += Math.hypot(p.x - q.x, p.y - q.y);
    p.len = total;
  }
  return pts.map((p) => ({ x: p.x, y: p.y, frac: total > 0 ? p.len / total : 0 }));
})();

const CROSS = SAMPLES.find((p) => p.y <= DASH_Y) ?? { x: 420, y: DASH_Y, frac: 0.9 };

const CURVE_AT = 112;
const CURVE_DUR = 51;

/** The two-segment draw: the easing is the exponent. */
function drawProgress(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t < 0.6 ? IN_CUBIC(t / 0.6) * 0.3 : 0.3 + OUT_EXPO((t - 0.6) / 0.4) * 0.7;
}

/** Frame at which the drawn tip passes the crossing fraction. */
const FLASH_FRAME = (() => {
  for (let k = 0; k <= 300; k++) {
    if (drawProgress(k / 300) >= CROSS.frac) {
      return CURVE_AT + (k / 300) * CURVE_DUR;
    }
  }
  return CURVE_AT + CURVE_DUR;
})();

const STACKS: readonly { count: number; at: number; left: number }[] = [
  { count: 2, at: 26, left: LADDER_LEFT + 48 - 11 },
  { count: 4, at: 48, left: LADDER_LEFT + 144 - 11 },
  { count: 8, at: 72, left: LADDER_LEFT + 240 - 11 },
  { count: 16, at: 97, left: LADDER_LEFT + 336 - 11 },
];

export function D3LadderScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const p = drawProgress((frame - CURVE_AT) / CURVE_DUR);
  const pathD = `M ${SAMPLES.map((s) => `${s.x} ${s.y}`).join(" L ")}`;
  const lineP = interpolate(frame, [62, 74], [0, 1], { easing: EASE_EXPO, ...clamp });
  const flash = interpolate(frame, [FLASH_FRAME, FLASH_FRAME + 6], [0, 1], clamp);
  const caption = (at: number) => ({
    opacity: enterAt(frame, fps, at / fps, 8 / fps),
    transform: `translateY(${(1 - enterAt(frame, fps, at / fps, 8 / fps)) * -10}px)`,
  });

  return (
    <Scene seed="econ-d3">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={2}
        headline="the appeal ladder"
        sub="each rung doubles the bond — the price of capture compounds past the prize"
      />

      {/* ladder + curve share one coordinate frame */}
      <div className="absolute" style={{ left: 680, top: 230, width: BOX_W, height: BOX_H }}>
        <svg
          className="absolute inset-0 overflow-visible"
          viewBox={`0 0 ${BOX_W} ${BOX_H}`}
        >
          <defs>
            <clipPath id="d3-dash-clip">
              <rect x={LADDER_LEFT} y={0} width={lineP * (540 - LADDER_LEFT)} height={BOX_H} />
            </clipPath>
          </defs>
          {/* the prize line */}
          <line
            x1={LADDER_LEFT}
            y1={DASH_Y}
            x2={540}
            y2={DASH_Y}
            className="stroke-nearwhite/40"
            strokeWidth={1.5}
            strokeDasharray="6 7"
            clipPath="url(#d3-dash-clip)"
          />
          {/* the cost curve — glow pass then stroke */}
          <path
            d={pathD}
            fill="none"
            className="stroke-amber"
            strokeWidth={7}
            strokeLinecap="round"
            opacity={0.22}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - p}
          />
          <path
            d={pathD}
            fill="none"
            className="stroke-amber"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - p}
          />
          {/* the crossing — flash ring + ✕ */}
          {frame >= FLASH_FRAME ? (
            <g className="text-slash">
              <circle
                cx={CROSS.x}
                cy={DASH_Y}
                r={4 + flash * 15}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                opacity={1 - flash}
              />
              <circle cx={CROSS.x} cy={DASH_Y} r={4} fill="currentColor" />
              <g stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <line x1={CROSS.x - 6} y1={DASH_Y - 6} x2={CROSS.x + 6} y2={DASH_Y + 6} />
                <line x1={CROSS.x - 6} y1={DASH_Y + 6} x2={CROSS.x + 6} y2={DASH_Y - 6} />
              </g>
            </g>
          ) : null}
        </svg>

        {/* prize-line label */}
        <div
          className="absolute font-mono text-xs text-text-secondary"
          style={{ right: 0, top: DASH_Y - 26, opacity: enterAt(frame, fps, 72 / fps, 6 / fps) }}
        >
          value of capturing the ruling
        </div>

        {/* the ladder (bottom edge on the baseline) */}
        <div className="absolute" style={{ left: LADDER_LEFT, bottom: BOX_H - BASELINE }}>
          <PanelLadder
            frame={frame}
            at={12}
            stagger={26}
            labels={["3 · ×1 (B)", "7 · ×2 (2B)", "15 · ×4 (4B)", "31 · ×8 (8B)"]}
            stepHeight={46}
            dotSize={9}
          />
        </div>

        {/* bond stacks double beside each rung */}
        {STACKS.map((s) => (
          <CoinStack
            key={s.count}
            frame={frame}
            fps={fps}
            at={s.at}
            count={s.count}
            style={{ left: s.left, top: 372 }}
          />
        ))}
      </div>

      {/* the two exhaustion facts */}
      <div className="absolute flex gap-8" style={{ left: 960, top: 872, translate: "-50% 0" }}>
        <div
          className="rounded-lg border border-border-subtle bg-raised px-5 py-3 font-mono text-sm text-text-secondary"
          style={caption(178)}
        >
          appeal budget exhausted → <span className="text-confirm">the ruling stands</span>
        </div>
        <div
          className="rounded-lg border border-border-subtle bg-raised px-5 py-3 font-mono text-sm text-text-secondary"
          style={caption(192)}
        >
          appeal flips the ruling → <span className="text-amber">bond refunded</span>
        </div>
      </div>
    </Scene>
  );
}
