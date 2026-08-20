import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, tween } from "../internal/motion-math";

/**
 * TallyBar — the vote count assembling after reveal: an amber majority
 * bar grows left-to-right, the minority fills the remainder in muted
 * nearwhite, mono YES/NO counts underneath. Pure function of `frame`.
 */
export const TallyBar: FC<{
  frame: number;
  yes: number;
  no: number;
  /** frame the tally starts growing */
  at: number;
  width?: number;
  className?: string;
}> = ({ frame, yes, no, at, width = 900, className }) => {
  const grow = tween(frame, [at, at + 28], [0, 1], easeExpo);
  const growNo = tween(frame, [at + 5, at + 30], [0, 1], easeExpo);
  const total = yes + no;
  return (
    <div className={className}>
      <div className="flex h-3 gap-1" style={{ width }}>
        <div
          data-bar
          className="h-full rounded-full bg-amber"
          style={{
            width: width * (yes / total) * grow,
            boxShadow: "0 0 14px var(--accord-amber)",
          }}
        />
        <div
          data-bar
          className="h-full rounded-full bg-nearwhite/25"
          style={{ width: width * (no / total) * growNo }}
        />
      </div>
      <div
        className="mt-2 flex justify-between font-mono text-xs tracking-[0.2em]"
        style={{ width }}
      >
        <span className="text-amber">YES · {Math.round(yes * grow)}</span>
        <span className="text-muted-foreground">NO · {Math.round(no * growNo)}</span>
      </div>
    </div>
  );
};
