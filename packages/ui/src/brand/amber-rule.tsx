import type { FC } from "react";

import { cn } from "../internal/cn";

/**
 * AmberRule — the amber hairline under a wordmark, scaling in from its
 * center. Static by default; width override via className (w-64, …).
 */
export const AmberRule: FC<{ enter?: number; className?: string }> = ({
  enter = 1,
  className,
}) => (
  <div
    className={cn("h-1 w-48 origin-center rounded-full bg-amber", className)}
    style={{ scale: `${enter} 1` }}
  />
);
