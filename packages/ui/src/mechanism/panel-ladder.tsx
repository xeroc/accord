import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, tween } from "../internal/motion-math";

/** Appeal panel sizes — the ladder the bond doubles against. */
export const PANEL_LADDER: readonly number[] = [3, 7, 15, 31];

/** Dot-grid column count per cluster (3 → row, 7 → 4 cols, 15/31 → 8). */
function clusterCols(count: number): number {
  return count <= 3 ? 3 : count <= 7 ? 4 : 8;
}

/**
 * PanelLadder — the appeal ladder: bottom-aligned steps of growing
 * dot clusters (3 → 7 → 15 → 31), each step rising with entrances
 * that compress ~0.7× per rung (the tempo IS the exponent), dots
 * micro-cascading inside their step, optional bond-price chips
 * underneath. Pure function of `frame`.
 */
export const PanelLadder: FC<{
  frame: number;
  /** dots per step, left→right (default 3·7·15·31) */
  steps?: readonly number[];
  /** frame step 0 rises (default 0) */
  at?: number;
  /** frames between step onsets (default 26 ≈ 0.9 s) */
  stagger?: number;
  /** bond/price chips under the steps, e.g. "×1 (B)" … "×8 (8B)" */
  labels?: readonly string[];
  /** px of height per rung (step i is (i+1)·stepHeight tall) */
  stepHeight?: number;
  dotSize?: number;
  className?: string;
}> = ({
  frame,
  steps = PANEL_LADDER,
  at = 0,
  stagger = 26,
  labels,
  stepHeight = 46,
  dotSize = 8,
  className,
}) => {
  const cols = (i: number) => clusterCols(steps[i] ?? 3);
  return (
    <div className={cn("flex items-end", className)}>
      {steps.map((count, i) => {
        const stepAt = at + i * stagger;
        // Deliberate compression: each rung enters ~0.7× the last, floored.
        const dur = Math.max(5, Math.round(12 * Math.pow(0.7, i)));
        const op = tween(frame, [stepAt, stepAt + dur], [0, 1], easeExpo);
        const y = tween(frame, [stepAt, stepAt + dur], [14, 0], easeExpo);
        const gridCols = cols(i);
        return (
          <div key={i} data-step={i} className="flex flex-col items-center">
            <div
              className="flex w-24 flex-wrap content-start items-end justify-center gap-x-1.5 gap-y-1.5 rounded-t-md border border-border-subtle bg-raised/60 px-2 pt-2"
              style={{
                height: (i + 1) * stepHeight,
                opacity: op,
                transform: `translateY(${y}px)`,
              }}
            >
              {Array.from({ length: count }, (_, d) => {
                // Micro-cascade: dots fill within ≤ 6 frames regardless of cluster size.
                const dotAt = stepAt + Math.floor((d * 6) / count);
                const dotPop = tween(frame, [dotAt, dotAt + 3], [0, 1], easeExpo);
                return (
                  <div
                    key={d}
                    data-dot
                    className="rounded-full bg-amber"
                    style={{
                      width: dotSize,
                      height: dotSize,
                      opacity: dotPop,
                      transform: `scale(${0.4 + dotPop * 0.6})`,
                    }}
                  />
                );
              })}
            </div>
            {labels?.[i] ? (
              <div
                data-label={i}
                className="mt-2 rounded-full border border-border-subtle bg-raised px-2.5 py-1 font-mono text-xs text-text-secondary"
                style={{ opacity: tween(frame, [stepAt + dur, stepAt + dur + 6], [0, 1], easeExpo) }}
              >
                {labels[i]}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
