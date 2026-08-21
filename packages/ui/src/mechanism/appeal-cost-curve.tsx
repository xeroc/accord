import type { FC } from "react";
import { cubicBezier } from "motion";

import { cn } from "../internal/cn";
import { easeExpo, tween } from "../internal/motion-math";

/**
 * AppealCostCurve — the appeal-ladder hero beat: the exponential cost
 * curve drawing over the PanelLadder staircase (slow crawl, explosive
 * rise — the two-segment easing IS the exponent), crossing the dashed
 * "value of capturing the ruling" line with a flash + ✕, then exiting
 * the top. Extracted verbatim from the v20260829-economics D3 scene.
 * Pair with a `PanelLadder` (default steps/stepHeight) placed at
 * `left: 88` with its floor on the baseline. Pure function of `frame`.
 */

/** The overlay's coordinate frame: a 560x500 box that holds the curve
 * itself — the baseline (the ladder's floor) sits at local y = 470 and
 * the curve peaks at y = 30. Heights are measured above the baseline. */
const BOX_W = 560;
const BOX_H = 500;
const BASELINE = 470;
const LADDER_LEFT = 88;
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

const IN_CUBIC = cubicBezier(0.32, 0, 0.67, 0);
const OUT_EXPO = cubicBezier(0.16, 1, 0.3, 1);

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

/** The two-segment draw: the easing is the exponent. */
function drawProgress(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return t < 0.6 ? IN_CUBIC(t / 0.6) * 0.3 : 0.3 + OUT_EXPO((t - 0.6) / 0.4) * 0.7;
}

/** Frame (relative to `at`) at which the drawn tip passes `frac`. */
function fracFrame(frac: number, dur: number): number {
  for (let k = 0; k <= 300; k++) {
    if (drawProgress(k / 300) >= frac) {
      return (k / 300) * dur;
    }
  }
  return dur;
}

const PATH_D = `M ${SAMPLES.map((s) => `${s.x} ${s.y}`).join(" L ")}`;

export const AppealCostCurve: FC<{
  frame: number;
  /** frame the curve starts drawing (default 0) */
  at?: number;
  /** draw length in frames (default 51 — the D3 tempo) */
  dur?: number;
  /** frame the dashed prize line draws L→R (default at − 50) */
  dashAt?: number;
  /** prize-line draw length (default 12) */
  dashDur?: number;
  /** frame the prize-line label settles in (default dashAt + 10) */
  labelAt?: number;
  /** caption right of the prize line (default the D3 copy) */
  prizeLabel?: string;
  className?: string;
}> = ({
  frame,
  at = 0,
  dur = 51,
  dashAt,
  dashDur = 12,
  labelAt,
  prizeLabel = "value of capturing the ruling",
  className,
}) => {
  const dash = dashAt ?? at - 50;
  const labelFrame = labelAt ?? dash + 10;
  const p = drawProgress((frame - at) / dur);
  const lineP = tween(frame, [dash, dash + dashDur], [0, 1], easeExpo);
  const flashAt = at + fracFrame(CROSS.frac, dur);
  const flash = tween(frame, [flashAt, flashAt + 6], [0, 1]);

  return (
    <div className={cn("relative", className)} style={{ width: BOX_W, height: BOX_H }}>
      <svg
        data-curve-svg
        className="absolute inset-0 overflow-visible"
        viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      >
        {/* the prize line — drawn L→R by growing x2 (dash pattern included) */}
        <line
          data-prize-line
          x1={LADDER_LEFT}
          y1={DASH_Y}
          x2={LADDER_LEFT + lineP * (540 - LADDER_LEFT)}
          y2={DASH_Y}
          className="stroke-nearwhite/40"
          strokeWidth={1.5}
          strokeDasharray="6 7"
        />
        {/* the cost curve — glow pass then stroke */}
        <path
          data-curve
          d={PATH_D}
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
          d={PATH_D}
          fill="none"
          className="stroke-amber"
          strokeWidth={2.5}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - p}
        />
        {/* the crossing — flash ring + ✕ */}
        {frame >= flashAt ? (
          <g data-cross className="text-slash">
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
        data-prize-label
        className="absolute font-mono text-xs text-text-secondary"
        style={{ right: 0, top: DASH_Y - 26, opacity: tween(frame, [labelFrame, labelFrame + 6], [0, 1], easeExpo) }}
      >
        {prizeLabel}
      </div>
    </div>
  );
};
