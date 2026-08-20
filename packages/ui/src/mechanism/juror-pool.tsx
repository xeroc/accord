import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

/**
 * JurorPool — the staked pool as a dot grid. Idle dots are hairline
 * grey; drawn jurors pop Verdict Amber (flash, settle, soft glow).
 * `drawnAt(dot)` returns the frame that dot is drawn, or undefined if
 * it never is. `fadeAt` retires the whole pool once the jury is seated;
 * `label` prints the mono caption above. Pure function of `frame`.
 */
export const JurorPool: FC<{
  frame: number;
  count: number;
  cols?: number;
  drawnAt: (dot: number) => number | undefined;
  dotSize?: number;
  fadeAt?: number;
  fadeDur?: number;
  label?: string;
  className?: string;
}> = ({
  frame,
  count,
  cols = 15,
  drawnAt,
  dotSize = 10,
  fadeAt,
  fadeDur = 18,
  label,
  className,
}) => {
  const inOp = tween(frame, [0, 15], [0, 1], easeExpo);
  const inY = tween(frame, [0, 15], [24, 0], easeExpo);
  const out = fadeAt ? tween(frame, [fadeAt, fadeAt + fadeDur], [1, 0], easeExpo) : 1;

  return (
    <div
      className={className}
      style={{ opacity: inOp * out, transform: `translateY(${inY}px)` }}
    >
      {label ? (
        <div className="mb-3 text-center font-mono text-xs tracking-[0.25em] text-muted-foreground">
          {label}
        </div>
      ) : null}
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: count }, (_, d) => {
          const at = drawnAt(d);
          // linear flash 0→1 over 4 frames, settle to 0.75 over 5 more
          const pop =
            at === undefined
              ? 0
              : frame < at + 4
                ? tween(frame, [at, at + 4], [0, 1], linear)
                : tween(frame, [at + 4, at + 9], [1, 0.75], linear);
          return (
            <div
              key={d}
              data-dot
              className="relative"
              style={{ width: dotSize, height: dotSize }}
            >
              <div
                className="absolute inset-0 rounded-full bg-border-subtle"
                style={{ opacity: 1 - pop }}
              />
              {at !== undefined ? (
                <div
                  className="absolute inset-0 rounded-full bg-amber"
                  style={{
                    opacity: pop,
                    scale: String(0.5 + pop * 0.9),
                    boxShadow: "0 0 12px var(--accord-amber)",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
