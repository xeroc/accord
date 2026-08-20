/**
 * EmptyState — the dashed placeholder panel for empty / no-access / blank
 * states: title, optional description, optional action slot.
 *
 * Promoted from apps/app where the same panel was pasted 8×; the dashed
 * border reads as "nothing here yet" against the solid raised cards.
 */
import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Typically one primary button / link (rendered centered below). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-dashed border-border p-12 text-center ${className}`}
    >
      <p className="mb-2 text-lg font-semibold">{title}</p>
      {description ? (
        <p className="mb-5 text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="flex justify-center">{action}</div> : null}
    </div>
  );
}
