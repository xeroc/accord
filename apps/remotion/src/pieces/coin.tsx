import type { FC } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

import { clamp } from "../shell/anim";

/** Canvas point for absolute-positioned arcs. */
export interface Pt {
  x: number;
  y: number;
}

/** Coin — an amber token arcing between two absolute canvas points. */
export const Coin: FC<{
  from: Pt;
  to: Pt;
  at: number;
  dur?: number;
}> = ({ from, to, at, dur = 16 }) => {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + dur) {
    return null;
  }
  const t = interpolate(frame, [at, at + dur], [0, 1], {
    easing: Easing.bezier(0.45, 0, 0.25, 1),
    ...clamp,
  });
  const yMid = Math.min(from.y, to.y) - 64;
  const x = from.x + (to.x - from.x) * t;
  const y = interpolate(t, [0, 0.5, 1], [from.y, yMid, to.y], clamp);
  const op = interpolate(
    frame,
    [at, at + 2, at + dur - 2, at + dur],
    [0, 1, 1, 0],
    clamp,
  );
  const s = interpolate(frame, [at, at + 3], [0.4, 1], clamp);
  return (
    <div
      className="absolute h-3.5 w-3.5 rounded-full"
      style={{
        left: x,
        top: y,
        translate: "-50% -50%",
        opacity: op,
        scale: String(s),
        backgroundColor: "var(--accord-amber)",
        boxShadow: "0 0 10px var(--accord-amber)",
      }}
    />
  );
};
