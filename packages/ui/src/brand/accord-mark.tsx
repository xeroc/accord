import type { FC } from "react";

import { cn } from "../internal/cn";

/**
 * AccordMark — THE Accord mark: three lines (two diagonals from the
 * top, one vertical from below) converging on a focal point. One
 * geometry everywhere (app navbar, landing, videos); never redraw it.
 *
 * Static by default (fully drawn) — pass `progress` (0→1) to animate
 * the draw-on. Color via currentColor (`text-amber`).
 */
export const AccordMark: FC<{
  size?: number;
  /** 0→1 line draw; default 1 (fully drawn) */
  progress?: number;
  className?: string;
}> = ({ size = 96, progress = 1, className }) => {
  const lines: Array<[number, number]> = [
    [7.5, 8.5],
    [24.5, 8.5],
    [16, 25],
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("text-amber", className)}
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth={2.4} strokeLinecap="square" fill="none">
        {lines.map(([x1, y1], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={16}
            y2={16}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - progress}
          />
        ))}
      </g>
    </svg>
  );
};
