import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, tween } from "../internal/motion-math";

const SIZES = {
  lg: "px-12 py-5 text-5xl tracking-[0.2em]",
  md: "px-10 py-4 text-4xl tracking-widest",
} as const;

/**
 * RulingStamp — the verdict landing: bordered amber mono text that
 * slams in from 1.6× with a slight counter-clockwise settle and an
 * amber glow. The hero moment of every mechanism story. Pure function
 * of `frame`.
 */
export const RulingStamp: FC<{
  frame: number;
  text: string;
  /** frame the stamp lands */
  at: number;
  dur?: number;
  size?: keyof typeof SIZES;
  glow?: boolean;
  className?: string;
}> = ({ frame, text, at, dur = 8, size = "lg", glow = true, className }) => {
  const op = tween(frame, [at, at + dur], [0, 1], easeExpo);
  const scale = tween(frame, [at, at + dur], [1.6, 1], easeExpo);
  const rotate = tween(frame, [at, at + dur], [-4, -2], easeExpo);
  return (
    <div
      className={cn(
        "w-fit rounded-md border-2 border-amber font-mono text-amber",
        SIZES[size],
        className,
      )}
      style={{
        opacity: op,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        boxShadow: glow ? "0 0 34px var(--accord-amber)" : undefined,
      }}
    >
      {text}
    </div>
  );
};
