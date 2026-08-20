/**
 * ErrorState — the read-failure panel: dashed EmptyState with a mono
 * message and a Retry button (the kit Button, so it carries the press /
 * focus / loading treatment for free).
 */
import type { ReactNode } from "react";

import { Button } from "../primitives/button";
import { EmptyState } from "./empty-state";

export function ErrorState({
  message,
  onRetry,
  title = "Read failed.",
  retryLabel = "Retry.",
}: {
  /** The raw error message, rendered in mono. */
  message: ReactNode;
  onRetry: () => void;
  title?: ReactNode;
  retryLabel?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={
        <span className="font-mono text-sm text-foreground">{message}</span>
      }
      action={<Button onClick={onRetry}>{retryLabel}</Button>}
    />
  );
}
