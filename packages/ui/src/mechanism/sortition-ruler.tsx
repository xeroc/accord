import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

/**
 * SortitionRuler — the number line [0, total_stake): stake-proportional
 * segments whose widths ARE the probability mass, endpoint labels, an
 * optional density-sweep wave (each bar bumps as it passes), a dart
 * that flies (shallow arc) and lands at r with a drop-needle, the
 * winning segment's tint sweep, and the diagonal-hatch "drawn —
 * excluded" state for sampling without replacement. Pure function
 * of `frame`.
 */
export const SortitionRuler: FC<{
  frame: number;
  /** juror stakes — segment widths ∝ values (the ruler never reshapes) */
  stakes: readonly number[];
  /** juror labels above the segments */
  labels?: readonly string[];
  /** frame the baseline draws + segments cascade in (default 0) */
  at?: number;
  /** frame the density wave sweeps across (probability made physical) */
  sweepAt?: number;
  /** landing point of the dart, in stake units [0, total) */
  dartR?: number;
  /** frame the dart lands (squash-settle + drop-needle) */
  dartAt?: number;
  /** departure point of the dart, in stake units (draws the throw arc) */
  throwFrom?: number;
  /** frame the throw departs (default dartAt − 10) */
  throwAt?: number;
  /** winning segment index (tint sweep) */
  winner?: number;
  /** frame the winner's tint sweep runs (default dartAt + 4) */
  winAt?: number;
  /** excluded (drawn) segment indices — hatch wipe */
  drawn?: readonly number[];
  /** frame the hatches wipe on (all drawn segments) */
  drawnAt?: number;
  width?: number;
  className?: string;
}> = ({
  frame,
  stakes,
  labels,
  at = 0,
  sweepAt,
  dartR,
  dartAt,
  throwFrom,
  throwAt,
  winner,
  winAt,
  drawn,
  drawnAt,
  width = 520,
  className,
}) => {
  const total = stakes.reduce((s, w) => s + w, 0) || 1;
  const gap = 2;
  const usable = width - gap * (stakes.length - 1);
  const segWidths = stakes.map((w) => (w / total) * usable);
  const segLeft: number[] = [];
  let cursor = 0;
  for (const w of segWidths) {
    segLeft.push(cursor);
    cursor += w + gap;
  }
  const stakeToX = (r: number) => (r / total) * width;

  // density wave: position sweeps L→R; bars bump as it passes.
  const waveX = sweepAt !== undefined ? tween(frame, [sweepAt, sweepAt + 17], [0, width], linear) : -1;

  // dart flight: optional shallow arc from throwFrom to dartR.
  const landAt = dartAt ?? 0;
  const departAt = throwAt ?? landAt - 10;
  const flight = tween(frame, [departAt, landAt], [0, 1], easeExpo);
  const dartX =
    dartR !== undefined && throwFrom !== undefined
      ? stakeToX(throwFrom + (dartR - throwFrom) * flight)
      : dartR !== undefined
        ? stakeToX(dartR)
        : -100;
  const arcY = throwFrom !== undefined ? -Math.sin(Math.PI * flight) * 26 : 0;
  const settle = tween(frame, [landAt, landAt + 4], [0, 1], easeExpo);
  const dartVisible = dartR !== undefined && frame >= departAt;
  const dartScale = dartVisible ? 0.97 + settle * 0.03 : 0;

  const drawnSet = new Set(drawn ?? []);
  const hatchAt = drawnAt ?? Infinity;

  return (
    <div className={cn("relative", className)} style={{ width }}>
      {/* segments */}
      <div className="absolute inset-x-0 bottom-0 flex items-end" style={{ height: 44 }}>
        {stakes.map((_, i) => {
          const w = segWidths[i] ?? 0;
          const left = segLeft[i] ?? 0;
          const segAt = at + 4 + i * 2;
          const inOp = tween(frame, [segAt, segAt + 10], [0, 1], easeExpo);
          const inY = tween(frame, [segAt, segAt + 10], [8, 0], easeExpo);
          const center = left + w / 2;
          const bump = waveX >= 0 ? 5 * Math.exp(-(((center - waveX) / 46) ** 2)) : 0;

          const isWinner = winner === i;
          const winSince = winAt ?? (dartAt !== undefined ? dartAt + 4 : 0);
          const winSweep = isWinner ? tween(frame, [winSince, winSince + 8], [0, 1], easeExpo) : 0;

          const isDrawn = drawnSet.has(i);
          const hatch = isDrawn ? tween(frame, [hatchAt, hatchAt + 8], [0, 1], easeExpo) : 0;

          return (
            <div
              key={i}
              data-seg={i}
              className="relative flex-shrink-0 overflow-hidden rounded-t-sm"
              style={{
                width: w,
                height: 30 + bump,
                marginLeft: i > 0 ? gap : 0,
                opacity: inOp,
                transform: `translateY(${inY}px)`,
                border: isWinner
                  ? "1px solid var(--accord-amber)"
                  : "1px solid var(--accord-border)",
              }}
            >
              {/* base mass */}
              <div className="absolute inset-0 bg-nearwhite/15" />
              {/* winner tint sweep */}
              {isWinner ? (
                <div
                  data-win-sweep
                  className="absolute inset-y-0 left-0 bg-amber/25"
                  style={{ width: `${winSweep * 100}%` }}
                />
              ) : null}
              {/* drawn — excluded hatch */}
              {isDrawn ? (
                <div
                  data-hatch
                  className="absolute inset-0"
                  style={{
                    opacity: hatch,
                    background:
                      "repeating-linear-gradient(45deg, transparent 0 3px, var(--accord-border) 3px 5px)",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      {/* baseline */}
      <div
        data-baseline
        className="absolute inset-x-0 bottom-0 h-px bg-border-subtle"
        style={{ transform: `scaleX(${tween(frame, [at, at + 14], [0, 1], easeExpo)})`, transformOrigin: "0 50%" }}
      />

      {/* endpoint labels */}
      <div
        className="absolute -bottom-6 inset-x-0 flex justify-between font-mono text-xs text-muted-foreground"
        style={{ opacity: tween(frame, [at + 16, at + 20], [0, 1], easeExpo) }}
      >
        <span>0</span>
        <span>total_stake</span>
      </div>

      {/* juror labels above segments */}
      {labels?.map((label, i) => (
        <div
          key={i}
          className="absolute font-mono text-xs text-text-secondary"
          style={{
            left: (segLeft[i] ?? 0) + (segWidths[i] ?? 0) / 2,
            top: -18,
            transform: "translateX(-50%)",
            opacity: tween(frame, [at + 8 + i * 2, at + 12 + i * 2], [0, 1], easeExpo),
          }}
        >
          {label}
        </div>
      ))}

      {/* dart + drop-needle */}
      {dartVisible ? (
        <>
          {frame >= landAt ? (
            <div
              data-needle
              className="absolute w-px bg-amber"
              style={{
                left: dartX,
                bottom: 0,
                height: 54,
                opacity: settle,
                boxShadow: "0 0 6px var(--accord-amber)",
              }}
            />
          ) : null}
          <div
            data-dart
            className="absolute"
            style={{
              left: dartX,
              bottom: 30 + arcY + 12,
              transform: `translate(-50%, 50%) scale(${dartScale}) rotate(${45 + (1 - flight) * 20}deg)`,
            }}
          >
            {/* needle-teardrop: 18 px, amber, pointed down */}
            <div
              className="h-[18px] w-[10px] rounded-t-full bg-amber"
              style={{ clipPath: "polygon(50% 100%, 0 22%, 0 0, 100% 0, 100% 22%)", boxShadow: "0 0 10px var(--accord-amber)" }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
};
