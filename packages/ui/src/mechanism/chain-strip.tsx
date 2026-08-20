import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

/**
 * ChainStrip — the on-chain ledger strip: muted blocky cells appending
 * left→right, hairline links drawing between them, one cell highlight
 * (the 32-byte hash cell) that breathes and can pulse once, and a
 * shimmer sweep for loop punctuation. Cells type their labels on
 * glyph-by-glyph when `typePerChar` is set (the hash cell typing in).
 * Pure function of `frame`.
 */
export const ChainStrip: FC<{
  frame: number;
  /** cell labels, in slot order (mono sigils or truncated hex) */
  cells: readonly string[];
  /** frame the first cell appends (default 0) */
  at?: number;
  /** frames between appends (default 8) */
  stagger?: number;
  /** per-cell append frame override (e.g. a cell landing with an event) */
  appendAt?: (index: number) => number;
  /** index of the highlighted cell (the on-chain hash cell) */
  highlight?: number;
  /** frame the highlight ignites (default: with the cell's append) */
  highlightAt?: number;
  /** frame the highlighted cell pulses once (secondary beat) */
  pulseAt?: number;
  /** frame a shimmer sweep crosses the strip left→right */
  shimmerAt?: number;
  /** frames per glyph while typing on (0 = instant, default 0) */
  typePerChar?: number;
  cellWidth?: number;
  height?: number;
  className?: string;
}> = ({
  frame,
  cells,
  at = 0,
  stagger = 8,
  appendAt,
  highlight,
  highlightAt,
  pulseAt,
  shimmerAt,
  typePerChar = 0,
  cellWidth = 84,
  height = 44,
  className,
}) => {
  const cellFrame = (i: number) => (appendAt ? appendAt(i) : at + i * stagger);

  // Shimmer sweep: a third-width highlight band crossing once, linear.
  const shimmer = shimmerAt !== undefined
    ? tween(frame, [shimmerAt, shimmerAt + 20], [0, 1], linear)
    : 0;

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      {cells.map((label, i) => {
        const cellAt = cellFrame(i);
        const inOp = tween(frame, [cellAt, cellAt + 10], [0, 1], easeExpo);
        const inX = tween(frame, [cellAt, cellAt + 10], [-12, 0], easeExpo);
        const isHash = highlight === i;
        const hashSince = highlightAt ?? cellAt;
        const hashLit = isHash ? tween(frame, [hashSince, hashSince + 8], [0, 1], easeExpo) : 0;

        // Deterministic breathing glow on the hash cell (3 s period at 30 fps).
        const breath = 0.45 + 0.25 * Math.sin((frame * 2 * Math.PI) / 90);
        // One-shot pulse: a single sine bump over 8 frames.
        const pulse = pulseAt !== undefined && isHash
          ? Math.sin(Math.PI * tween(frame, [pulseAt, pulseAt + 8], [0, 1], linear))
          : 0;

        const shown =
          typePerChar > 0
            ? label.slice(
                0,
                Math.max(
                  0,
                  Math.min(label.length, Math.floor((frame - cellAt - 3) / typePerChar) + 1),
                ),
              )
            : label;

        const linkDraw =
          i > 0 ? tween(frame, [cellFrame(i - 1) + 4, cellFrame(i - 1) + 10], [0, 1], easeExpo) : 1;

        return (
          <div key={i} className="flex items-center">
            {i > 0 ? (
              <div
                data-link
                className="h-px w-3 bg-border-subtle"
                style={{ transform: `scaleX(${linkDraw})` }}
              />
            ) : null}
            <div
              data-cell={i}
              className={cn(
                "relative flex flex-shrink-0 items-center justify-center overflow-hidden rounded-md border font-mono text-xs tracking-wider",
                isHash ? "border-amber/60 bg-amber/10 text-amber" : "border-border-subtle bg-raised text-text-secondary",
              )}
              style={{
                width: cellWidth,
                height,
                opacity: inOp,
                transform: `translateX(${inX}px) scale(${1 + pulse * 0.06})`,
                boxShadow: isHash ? `0 0 ${12 * breath * hashLit}px var(--accord-amber)` : undefined,
              }}
            >
              <span data-cell-label={i}>{shown || "\u00A0"}</span>
            </div>
          </div>
        );
      })}

      {shimmer > 0 && shimmer < 1 ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-md">
          <div
            data-shimmer
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-nearwhite/10 to-transparent"
            style={{ transform: `translateX(${shimmer * 300 - 100}%)` }}
          />
        </div>
      ) : null}
    </div>
  );
};
