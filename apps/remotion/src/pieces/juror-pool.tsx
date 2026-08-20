import type { FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../shell/presets";
import { clamp } from "../shell/anim";

/**
 * JurorPool — the staked pool as a dot grid. Idle dots are hairline
 * grey; drawn jurors pop Verdict Amber (flash, settle, soft glow).
 * `drawnAt(dot)` returns the frame that dot is drawn, or undefined if
 * it never is. `fadeAt` fades the whole pool away once the jury is
 * seated; `label` prints the mono caption above (e.g. "STAKED POOL · 30").
 */
export const JurorPool: FC<{
  count: number;
  cols?: number;
  drawnAt: (dot: number) => number | undefined;
  dotSize?: number;
  fadeAt?: number;
  fadeDur?: number;
  label?: string;
  className?: string;
}> = ({
  count,
  cols = 15,
  drawnAt,
  dotSize = 10,
  fadeAt,
  fadeDur = 18,
  label,
  className,
}) => {
  const frame = useCurrentFrame();
  const inOp = interpolate(frame, [0, 15], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const inY = interpolate(frame, [0, 15], [24, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const out = fadeAt
    ? interpolate(frame, [fadeAt, fadeAt + fadeDur], [1, 0], {
        easing: EASE_EXPO,
        ...clamp,
      })
    : 1;

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
          const pop =
            at !== undefined
              ? interpolate(frame, [at, at + 4, at + 9], [0, 1, 0.75], clamp)
              : 0;
          return (
            <div
              key={d}
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
                    boxShadow: "0 0 12px var(--color-amber)",
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
