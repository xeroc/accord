import type { FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../shell/presets";
import { clamp } from "../shell/anim";
import { cn } from "../shell/cn";

const SIZES = {
  lg: "px-12 py-5 text-5xl tracking-[0.2em]",
  md: "px-10 py-4 text-4xl tracking-widest",
} as const;

/**
 * RulingStamp — the verdict landing: bordered amber mono text that
 * slams in from 1.6× with a slight counter-clockwise settle and an
 * amber glow. The hero moment of every mechanism story.
 */
export const RulingStamp: FC<{
  text: string;
  /** frame the stamp lands */
  at: number;
  dur?: number;
  size?: keyof typeof SIZES;
  glow?: boolean;
  className?: string;
}> = ({ text, at, dur = 8, size = "lg", glow = true, className }) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [at, at + dur], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const scale = interpolate(frame, [at, at + dur], [1.6, 1], {
    easing: EASE_EXPO,
    output: "perceptual-scale",
    ...clamp,
  });
  const rotate = interpolate(frame, [at, at + dur], [-4, -2], {
    easing: EASE_EXPO,
    ...clamp,
  });
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
        boxShadow: glow ? "0 0 34px var(--color-amber)" : undefined,
      }}
    >
      {text}
    </div>
  );
};
