import type { FC } from "react";

import { cn } from "./cn";

/**
 * Brand elements for video scenes. Presentational only: components take
 * 0..1 progress values computed by the scene (enterAt & co.); no frame
 * hooks in here.
 */

/**
 * AccordMark — THE Accord mark: three lines (two diagonals from the top,
 * one vertical from below) converging on a focal dot. Same geometry as
 * the app navbar glyph (apps/app/src/components/navbar.tsx) — do not
 * fork the geometry; consistency across surfaces is the point.
 *
 * `progress` draws the lines (0→1), `dot` pops the center (0→1).
 * Color via currentColor — wrap in a text color utility (text-amber).
 */
export const AccordMark: FC<{
  size?: number;
  progress: number;
  dot: number;
  className?: string;
}> = ({ size = 96, progress, dot, className }) => {
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
      className={className}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="square"
        fill="none"
      >
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
      <circle
        cx={16}
        cy={16}
        r={2 + 1.4 * dot}
        fill="currentColor"
        opacity={dot}
      />
    </svg>
  );
};

/**
 * Wordmark — the "Accord" text lockup. `enter` (0→1) fades it in while
 * settling from 40px below; sizing/tracking via className (text-8xl,
 * text-9xl, text-[10rem] leading-none, …).
 */
export const Wordmark: FC<{
  enter: number;
  settle?: number;
  className?: string;
}> = ({ enter, settle = 40, className }) => (
  <div
    className={cn(
      "font-heading font-bold tracking-tight text-nearwhite",
      className,
    )}
    style={{ opacity: enter, translate: `0px ${(1 - enter) * settle}px` }}
  >
    Accord
  </div>
);

/**
 * AmberRule — the amber hairline under a wordmark, scaling in from its
 * center. Width override via className (w-64, …).
 */
export const AmberRule: FC<{ enter: number; className?: string }> = ({
  enter,
  className,
}) => (
  <div
    className={cn("h-1 w-48 origin-center rounded-full bg-amber", className)}
    style={{ scale: `${enter} 1` }}
  />
);
