import type { FC } from "react";

import { cn } from "../internal/cn";

/**
 * Wordmark — the "Accord" text lockup. Static by default; `enter`
 * (0→1) fades it in while settling from `settle` px below. Sizing and
 * tracking via className (text-8xl, text-[10rem] leading-none, …).
 */
export const Wordmark: FC<{
  enter?: number;
  settle?: number;
  className?: string;
}> = ({ enter = 1, settle = 40, className }) => (
  <div
    className={cn("font-heading font-bold tracking-tight text-nearwhite", className)}
    style={{ opacity: enter, translate: `0px ${(1 - enter) * settle}px` }}
  >
    Accord
  </div>
);
