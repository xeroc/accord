/**
 * DisputeStatusCard — display-only Accord dispute status panel.
 *
 * Owns the section/h3/dl/row markup + footer (action + note) shared by the
 * canon (item) and synod (case) dispute cards. All data is app-prepared:
 * apps decode the `Dispute` account, format state/ruling/timestamps, and
 * build the Accord-dApp deep link — nothing SDK- or env-shaped enters this
 * module.
 */
import type { ReactNode } from "react";

import { cn } from "../internal/cn";

/** One definition-list row: muted label left, value right-aligned. */
export interface DisputeStatusRow {
  label: ReactNode;
  value: ReactNode;
}

export function DisputeStatusCard({
  title,
  rows,
  action,
  note,
  className,
}: {
  /** Card heading, e.g. "Backing dispute". Omit to render without one. */
  title?: ReactNode;
  rows: readonly DisputeStatusRow[];
  /** Footer action — typically the "Open in Accord →" deep link. */
  action?: ReactNode;
  /** Footer note(s) — hints and fallback copy. */
  note?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg bg-card p-4 ring-1 ring-foreground/10",
        className,
      )}
    >
      {title ? (
        <h3
          className="font-mono text-sm text-foreground"
          style={{ color: "var(--amber)", marginBottom: "0.5rem" }}
        >
          {title}
        </h3>
      ) : null}
      <dl className="grid gap-2">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
      {action}
      {note}
    </section>
  );
}
