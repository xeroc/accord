/**
 * Skeleton — shadcn-style loading placeholder (animate-pulse bar). The full
 * shadcn init (components.json, utils, Radix tree) lands with the brand-tokens
 * bean; the list view only needs this one primitive, so it ships inline.
 *
 * ponytail: no shadcn CLI for one component — add `cn`/Radix when a second
 * primitive lands.
 */
import type { CSSProperties } from "react";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`animate-pulse rounded-sm bg-border ${className ?? ""}`} style={style} aria-hidden />
  );
}
