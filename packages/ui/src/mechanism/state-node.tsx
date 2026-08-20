import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

/**
 * StateNode — one station of a lifecycle rail. Rests at the dim
 * baseline (muted text on a half-faded pill — dimmed through color,
 * never by multiplying text opacity, so contrast survives); ignites
 * at `activeAt` (amber pill + glow + an expanding ring ripple —
 * arrival energy at zero overshoot); relaxes at `settleAt` to the
 * calm "visited" state (confirm-tinted border) or back to the dim
 * baseline for the loop seam. Pure function of `frame`.
 */
export const StateNode: FC<{
  frame: number;
  /** station name, e.g. "Created", "Filed" */
  label: string;
  /** frame the node enters the diagram (default 0) */
  at?: number;
  /** frame it ignites (amber pill, glow, ring ripple) */
  activeAt?: number;
  /** frame it relaxes out of the active state */
  settleAt?: number;
  /** where it relaxes to (default "visited") */
  settleTo?: "visited" | "baseline";
  className?: string;
}> = ({ frame, label, at = 0, activeAt, settleAt, settleTo = "visited", className }) => {
  const entered = tween(frame, [at, at + 8], [0, 1], easeExpo);
  const ignite = activeAt !== undefined ? tween(frame, [activeAt, activeAt + 6], [0, 1], easeExpo) : 0;
  const settle = settleAt !== undefined ? tween(frame, [settleAt, settleAt + 8], [0, 1], easeExpo) : 0;

  // Ring ripple: expands + fades over 10 frames from ignition.
  const ring = activeAt !== undefined ? tween(frame, [activeAt, activeAt + 10], [0, 1], linear) : 0;
  const showRing = ring > 0 && ring < 1;

  const activeMix = ignite * (1 - settle);
  const visitedMix = settle * ignite;
  // Dominant state picks the pill classes; the ring covers the flip.
  const active = activeMix > 0.5;
  const visited = !active && visitedMix > 0.5;

  return (
    <div data-node={label} className={cn("relative w-fit", className)} style={{ opacity: entered }}>
      {showRing ? (
        <div
          data-ring
          className="pointer-events-none absolute inset-0 rounded-full border border-amber"
          style={{ transform: `scale(${1 + ring * 0.7})`, opacity: 1 - ring }}
        />
      ) : null}
      <div
        data-state={active ? "active" : visited ? "visited" : "dim"}
        className={cn(
          "whitespace-nowrap rounded-full border px-4 py-1.5 font-mono text-xs",
          active
            ? "border-amber/60 bg-amber/10 text-amber"
            : visited
              ? "border-confirm/30 bg-raised text-text-secondary"
              : "border-border-subtle bg-raised/40 text-muted-foreground",
        )}
        style={active ? { boxShadow: `0 0 ${10 * activeMix}px var(--accord-amber)` } : undefined}
      >
        {label}
      </div>
    </div>
  );
};
