import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { Scene } from "../../../src/shell/scene";

/**
 * chrome.tsx — the group-F scene chrome + the shared motion helpers the
 * seven concept scenes are built from. Everything is a pure function of
 * `frame` (determinism rules); enter/exit fades go through the shell's
 * enterAt/exitAt, and the one frame-window tween below is the single
 * sanctioned place a brand-eased value is computed.
 */

/** Brand-eased tween over a frame window, clamped both ends. */
export function tw(
  frame: number,
  from: number,
  to: number,
  out0: number,
  out1: number,
): number {
  if (to <= from) {
    return frame >= to ? out1 : out0;
  }
  return interpolate(frame, [from, to], [out0, out1], {
    easing: EASE_EXPO,
    ...clamp,
  });
}

/** Linear tween over a frame window, clamped (scanner/conveyor semantics). */
export function lin(
  frame: number,
  from: number,
  to: number,
  out0: number,
  out1: number,
): number {
  if (to <= from) {
    return frame >= to ? out1 : out0;
  }
  return interpolate(frame, [from, to], [out0, out1], clamp);
}

/** Ambient breathing: 0..1 sine, deterministic in frame. */
export function breath(frame: number, period: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin((frame * 2 * Math.PI) / period + phase);
}

/** Enter style: opacity + 16px settle-rise over [at, at+dur]. */
export function rise(frame: number, at: number, dur = 10): {
  opacity: number;
  transform: string;
} {
  const p = tw(frame, at, at + dur, 0, 1);
  return { opacity: p, transform: `translateY(${(1 - p) * 16}px)` };
}

/** Pop-in: scale 0.6→1 with fade (zero overshoot). */
export function pop(frame: number, at: number, dur = 9): {
  opacity: number;
  transform: string;
} {
  const p = tw(frame, at, at + dur, 0, 1);
  return { opacity: p, transform: `scale(${0.6 + p * 0.4})` };
}

/** SVG stroke-draw offset for pathLength=1 / dasharray=1 conventions. */
export function draw(frame: number, at: number, dur = 12): number {
  return tw(frame, at, at + dur, 1, 0);
}

/** A stepped keyframe path: brand-eased between consecutive points. */
export function stepped(
  frame: number,
  steps: ReadonlyArray<{ at: number; x: number; y: number }>,
): { x: number; y: number } {
  if (steps.length === 0) {
    return { x: 0, y: 0 };
  }
  const first = steps[0] as { at: number; x: number; y: number };
  if (frame <= first.at) {
    return { x: first.x, y: first.y };
  }
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i] as { at: number; x: number; y: number };
    const b = steps[i + 1] as { at: number; x: number; y: number };
    if (frame >= a.at && frame <= b.at) {
      const p = tw(frame, a.at, b.at, 0, 1);
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
    }
  }
  const last = steps[steps.length - 1] as { at: number; x: number; y: number };
  return { x: last.x, y: last.y };
}

/** Quadratic-bezier arc point (for refund / funds flights). */
export function arcPoint(
  t: number,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * y0 + 2 * u * t * cy + t * t * y1,
  };
}

/**
 * ArcToken — a mint-toned particle flying a curved path between two
 * points of its parent (locally positioned; NOT the canvas Coin).
 * tone picks the token colors: stake (nearwhite) · fee (amber) ·
 * confirm (refund/escape teal).
 */
export const ARC_TONE = {
  stake: { dot: "bg-nearwhite", glow: "0 0 10px var(--accord-nearwhite)" },
  fee: { dot: "bg-amber", glow: "0 0 10px var(--accord-amber)" },
  confirm: { dot: "bg-confirm", glow: "0 0 10px var(--accord-confirm)" },
} as const;

export function ArcToken({
  frame,
  from,
  to,
  lift = -90,
  at,
  dur = 15,
  tone = "fee",
  size = 12,
}: {
  frame: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  lift?: number;
  at: number;
  dur?: number;
  tone?: keyof typeof ARC_TONE;
  size?: number;
}) {
  if (frame < at || frame > at + dur + 4) {
    return null;
  }
  const t = lin(frame, at, at + dur, 0, 1);
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) + lift;
  const p = arcPoint(t, from.x, from.y, cx, cy, to.x, to.y);
  const op = interpolate(frame, [at, at + 2, at + dur, at + dur + 3], [0, 1, 1, 0], clamp);
  const s = lin(frame, at, at + 3, 0.5, 1);
  return (
    <div
      className={`absolute rounded-full ${ARC_TONE[tone].dot}`}
      style={{
        left: p.x,
        top: p.y,
        width: size,
        height: size,
        translate: "-50% -50%",
        opacity: op,
        scale: String(s),
        boxShadow: ARC_TONE[tone].glow,
      }}
    />
  );
}

/**
 * ConceptScene — the shared per-concept frame: mono kicker + heading up
 * top, the illustration centered, a persistent mono caption below.
 */
export function ConceptScene({
  seed,
  kicker,
  title,
  caption,
  captionAt = 0.4,
  children,
}: {
  seed: string;
  kicker: string;
  title: string;
  caption: string;
  captionAt?: number;
  children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene seed={seed}>
      <div className="relative flex h-full w-full flex-col items-center px-16 pb-10 pt-9">
        <header className="flex flex-col items-center gap-2">
          <div
            className="font-mono text-sm tracking-[0.35em] text-amber"
            style={{ opacity: enterAt(frame, fps, 0.05, 0.35) }}
          >
            {kicker}
          </div>
          <h2
            className="font-heading text-4xl font-bold text-nearwhite"
            style={{ opacity: enterAt(frame, fps, 0.15, 0.4) }}
          >
            {title}
          </h2>
        </header>
        <div className="relative flex w-full flex-1 items-center justify-center">
          {children}
        </div>
        <footer
          className="font-mono text-xl text-text-secondary"
          style={{ opacity: enterAt(frame, fps, captionAt, 0.5) }}
        >
          {caption}
        </footer>
      </div>
    </Scene>
  );
}

