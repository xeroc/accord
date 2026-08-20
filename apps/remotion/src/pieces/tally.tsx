import type { FC } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../shell/presets";
import { clamp } from "../shell/anim";

/**
 * TallyBar — the vote count assembling after reveal: an amber majority
 * bar grows left-to-right, the minority fills the remainder in muted
 * nearwhite, mono YES/NO counts underneath.
 */
export const TallyBar: FC<{
  yes: number;
  no: number;
  /** frame the tally starts growing */
  at: number;
  width?: number;
  className?: string;
}> = ({ yes, no, at, width = 900, className }) => {
  const frame = useCurrentFrame();
  const total = yes + no;
  const grow = interpolate(frame, [at, at + 28], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const growNo = interpolate(frame, [at + 5, at + 30], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  return (
    <div className={className}>
      <div className="flex h-3 gap-1" style={{ width }}>
        <div
          className="h-full rounded-full bg-amber"
          style={{
            width: width * (yes / total) * grow,
            boxShadow: "0 0 14px var(--color-amber)",
          }}
        />
        <div
          className="h-full rounded-full bg-nearwhite/25"
          style={{ width: width * (no / total) * growNo }}
        />
      </div>
      <div
        className="mt-2 flex justify-between font-mono text-xs tracking-[0.2em]"
        style={{ width }}
      >
        <span className="text-amber">
          YES · {Math.round(yes * grow)}
        </span>
        <span className="text-muted-foreground">
          NO · {Math.round(no * growNo)}
        </span>
      </div>
    </div>
  );
};

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
        backgroundColor: "var(--color-amber)",
        boxShadow: "0 0 10px var(--color-amber)",
      }}
    />
  );
};

export interface Pt {
  x: number;
  y: number;
}
