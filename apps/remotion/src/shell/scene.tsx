import type { FC, ReactNode } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "./anim";
import { Backdrop } from "./backdrop";
import { cn } from "./cn";

/**
 * Scene — the standard scene frame: shared Backdrop behind a relative
 * full-bleed layer. `stack` additionally centers content in a column
 * (padding p-16; tune gap via className, e.g. "gap-10").
 */
export const Scene: FC<{
  seed: string;
  stack?: boolean;
  className?: string;
  children: ReactNode;
}> = ({ seed, stack, className, children }) => (
  <div className="relative h-full w-full">
    <Backdrop seed={seed} />
    {stack ? (
      <div
        className={cn("relative flex h-full flex-col items-center justify-center p-16", className)}
      >
        {children}
      </div>
    ) : (
      children
    )}
  </div>
);

/**
 * Beat — one step of a mechanism walkthrough: visual center, copy bottom
 * (`copy` enters at 0.05s, `sub` at 0.25s, brand ease). The step label
 * belongs to the StepRail up top — one label per step, not two.
 */
export const Beat: FC<{
  copy: string;
  sub: string;
  copyClass?: string;
  children: ReactNode;
}> = ({ copy, sub, copyClass, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-12 p-16">
      <div className="flex h-[380px] items-center justify-center">
        {children}
      </div>
      <div className="flex flex-col items-center gap-4">
        <h2
          className={`font-heading font-bold text-nearwhite ${copyClass ?? "text-5xl"}`}
          style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
        >
          {copy}
        </h2>
        <p
          className="font-mono text-2xl text-text-secondary"
          style={{ opacity: enterAt(frame, fps, 0.25, 0.4) }}
        >
          {sub}
        </p>
      </div>
    </div>
  );
};
