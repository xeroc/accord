import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";

/**
 * SortitionRuler — the number line [0, total_stake): stake-proportional
 * segments whose widths ARE the probability mass, endpoint labels, an
 * optional density-sweep wave (each bar bumps as it passes), darts
 * that fly (shallow arc) and land at r, marking the pick with a
 * drop-needle and a round dot at its end, winner tint sweeps, and
 * the diagonal-hatch "drawn — excluded" state for
 * sampling without replacement. Pure function of `frame`.
 *
 * One dart/winner/hatch is enough for a single draw; pass the plural
 * props (`darts`, `wins`, `hatches`) to play the full collision →
 * draw_attempt re-derivation story on one ruler (extra darts can
 * dissolve — the discarded attempt; each segment can hatch on its own
 * beat; a dart can sit pinned at `pinAt` before its throw departs).
 */

export type SortitionDart = {
  /** landing point, in stake units [0, total) */
  r: number;
  /** departure point in stake units — omit for a dart that appears at r */
  from?: number;
  /** frame the dart appears pinned at `from`, before the throw departs */
  pinAt?: number;
  /** frame the throw departs */
  throwAt: number;
  /** frame the dart lands (squash-settle + drop-needle) */
  landAt: number;
  /** frame the dart + needle dissolve (the discarded collision) */
  dissolveAt?: number;
};

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
  /** additional darts (collision + re-derivation throws) */
  darts?: readonly SortitionDart[];
  /** additional winner tint sweeps — { seg, at } per sweep */
  wins?: readonly { seg: number; at: number }[];
  /** additional hatches, each on its own beat — { seg, at } */
  hatches?: readonly { seg: number; at: number }[];
  /** box height — baseline at the bottom, room above for labels + dart (default 102) */
  height?: number;
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
  darts,
  wins,
  hatches,
  height = 102,
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

  // classic single-dart/winner/hatch props normalize into the plural forms
  const allDarts: SortitionDart[] = [
    ...(dartR !== undefined
      ? [
          {
            r: dartR,
            from: throwFrom,
            throwAt: throwAt ?? (dartAt ?? 0) - 10,
            landAt: dartAt ?? 0,
          },
        ]
      : []),
    ...(darts ?? []),
  ];
  const allWins = [
    ...(winner !== undefined
      ? [{ seg: winner, at: winAt ?? (dartAt !== undefined ? dartAt + 4 : 0) }]
      : []),
    ...(wins ?? []),
  ];
  const allHatches = [
    ...(drawn !== undefined && drawnAt !== undefined ? drawn.map((seg) => ({ seg, at: drawnAt })) : []),
    ...(hatches ?? []),
  ];

  // density wave: position sweeps L→R; bars bump as it passes.
  const waveX = sweepAt !== undefined ? tween(frame, [sweepAt, sweepAt + 17], [0, width], linear) : -1;

  const drawnSet = new Set(allHatches.map((h) => h.seg));
  return (
    <div className={cn("relative", className)} style={{ width, height }}>
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

          const wins_ = allWins.filter((wn) => wn.seg === i);
          const isWinner = wins_.length > 0;
          const winSweep = wins_.reduce(
            (p, wn) => Math.max(p, tween(frame, [wn.at, wn.at + 8], [0, 1], easeExpo)),
            0,
          );

          const isDrawn = drawnSet.has(i);
          const hatch = allHatches
            .filter((h) => h.seg === i)
            .reduce(
              (p, h) => Math.max(p, tween(frame, [h.at, h.at + 8], [0, 1], easeExpo)),
              0,
            );

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
            bottom: 50,
            left: (segLeft[i] ?? 0) + (segWidths[i] ?? 0) / 2,
            transform: "translateX(-50%)",
            opacity: tween(frame, [at + 8 + i * 2, at + 12 + i * 2], [0, 1], easeExpo),
          }}
        >
          {label}
        </div>
      ))}

      {/* darts + drop-needles */}
      {allDarts.map((d, di) => {
        const landAt = d.landAt;
        const departAt = d.throwAt;
        const flight = tween(frame, [departAt, landAt], [0, 1], easeExpo);
        const startX = d.from ?? d.r;
        const dartX = d.from !== undefined ? stakeToX(startX + (d.r - startX) * flight) : stakeToX(d.r);
        const arcY = d.from !== undefined ? -Math.sin(Math.PI * flight) * 26 : 0;
        const settle = tween(frame, [landAt, landAt + 4], [0, 1], easeExpo);
        const appearAt = d.pinAt ?? departAt;
        const dartVisible = frame >= appearAt;
        const out = d.dissolveAt !== undefined ? tween(frame, [d.dissolveAt, d.dissolveAt + 5], [1, 0], linear) : 1;
        const dartScale = dartVisible ? 0.97 + settle * 0.03 : 0;
        const dartOp = out * tween(frame, [appearAt, appearAt + 4], [0, 1], linear);
        if (!dartVisible) {
          return null;
        }
        return (
          <div key={di} data-dart={di}>
            {frame >= landAt ? (
              <div
                data-needle={di}
                className="absolute w-px bg-amber"
                style={{
                  left: dartX,
                  bottom: 0,
                  height: 54,
                  opacity: settle * out,
                  boxShadow: "0 0 6px var(--accord-amber)",
                }}
              />
            ) : null}
            <div
              data-dart-body={di}
              className="absolute"
              style={{
                left: dartX,
                bottom: 30 + arcY + 12,
                transform: `translate(-50%, 50%) scale(${dartScale})`,
                opacity: dartOp,
              }}
            >
              {/* the pick: a round marker at the needle's end */}
              <div
                className="h-3 w-3 rounded-full bg-amber"
                style={{ boxShadow: "0 0 10px var(--accord-amber)" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
