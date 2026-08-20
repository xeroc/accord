import type { FC, ReactNode } from "react";

import { cn } from "../internal/cn";
import { easeExpo, tween } from "../internal/motion-math";

/**
 * The five things a Subaccord owns — the canonical internals row set
 * (orientation map, group A). Reference, don't retype: scenes that
 * show "a Subaccord owns exactly these five things" pass this.
 */
export const SUBACCORD_INTERNALS: readonly { label: string; value?: string }[] = [
  { label: "stake vault" },
  { label: "fee vault" },
  { label: "accumulator root" },
  { label: "evidence operator" },
  { label: "authority" },
];

/**
 * SubaccordCard — the owned-state container. Expanded: the card
 * settles in, then its internals cascade (fade + settle-rise, one
 * stagger apart) — "a Subaccord owns exactly these things."
 * Collapsed: the dimmed stack variant for the "many, permissionless"
 * background chorus — offset ghost layers, no internals, 60 % dim.
 *
 * Compose richer interiors (vault boxes, counters) through `children`;
 * offset each child's own `at` by `stagger` frames to keep the
 * cascade. Pure function of `frame`.
 */
export const SubaccordCard: FC<{
  frame: number;
  title: string;
  /** frame the card itself settles in (default 0) */
  at?: number;
  /** internals to cascade inside (text rows; default none) */
  internals?: readonly { label: string; value?: string }[];
  /** frame the internals cascade starts (default at + 6) */
  internalsAt?: number;
  /** frames between internal rows (default 2 — the 60 ms cascade) */
  stagger?: number;
  /** dimmed collapsed-stack variant (no internals, offset ghost layers;
   *  dimmed through muted classes, never text opacity) */
  collapsed?: boolean;
  className?: string;
  children?: ReactNode;
}> = ({
  frame,
  title,
  at = 0,
  internals,
  internalsAt,
  stagger = 2,
  collapsed = false,
  className,
  children,
}) => {
  const cardIn = tween(frame, [at, at + 15], [0, 1], easeExpo);
  const cardY = tween(frame, [at, at + 15], [12, 0], easeExpo);
  const cascade = internalsAt ?? at + 6;

  return (
    <div
      data-subaccord
      className={cn("relative", className)}
      style={{ opacity: cardIn, transform: `translateY(${cardY}px)` }}
    >
      {collapsed ? (
        <>
          <div data-ghost className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl border border-border-subtle" />
          <div data-ghost className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl border border-border-subtle" />
        </>
      ) : null}
      <div className={cn("rounded-xl border border-border-subtle", collapsed ? "bg-raised/40" : "bg-raised/60")}>
        <div className="flex items-center justify-between gap-6 px-4 pt-3 pb-1">
          <span
            className={cn(
              "font-mono text-xs tracking-[0.25em]",
              collapsed ? "text-muted-foreground" : "text-text-secondary",
            )}
          >
            {title}
          </span>
          {collapsed ? (
            <span className="font-mono text-xs text-muted-foreground">⋮ many</span>
          ) : null}
        </div>
        {collapsed ? <div className="h-3" /> : null}
        {!collapsed && internals && internals.length > 0 ? (
          <div className="flex flex-col gap-1.5 px-4 pb-4">
            {internals.map((row, i) => {
              const rowAt = cascade + i * stagger;
              const op = tween(frame, [rowAt, rowAt + 12], [0, 1], easeExpo);
              const y = tween(frame, [rowAt, rowAt + 12], [6, 0], easeExpo);
              return (
                <div
                  key={row.label}
                  data-internal={row.label}
                  className="flex items-center justify-between gap-6 rounded-md border border-border-subtle bg-ink px-2.5 py-1 font-mono text-xs"
                  style={{ opacity: op, transform: `translateY(${y}px)` }}
                >
                  <span className="text-text-secondary">{row.label}</span>
                  {row.value ? (
                    <span className="tabular-nums text-muted-foreground">{row.value}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {!collapsed && children ? <div className="px-4 pb-4">{children}</div> : null}
      </div>
    </div>
  );
};
