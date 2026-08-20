import type { FC } from "react";

/**
 * The Accord convergence glyph — four lines converging on a focal point
 * (the landing og.svg mark). `progress` draws the lines (0→1), `dot`
 * pops the center (0→1). Color comes from `currentColor` — wrap in a
 * text color utility (text-amber).
 */
export const ConvergenceGlyph: FC<{
  size?: number;
  progress: number;
  dot: number;
  className?: string;
}> = ({ size = 96, progress, dot, className }) => {
  const c = size / 2;
  const e = size - 2;
  const corners: Array<[number, number]> = [
    [2, 2],
    [e, 2],
    [2, e],
    [e, e],
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden
    >
      {corners.map(([x, y], i) => (
        <line
          key={i}
          x1={x}
          y1={y}
          x2={c}
          y2={c}
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="square"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - progress}
        />
      ))}
      <circle cx={c} cy={c} r={3 + 3 * dot} fill="currentColor" opacity={dot} />
    </svg>
  );
};
