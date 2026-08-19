/**
 * PageShell — the app page frame: optional header slot + the centered
 * `<main>` container (max-w-6xl, px-6 py-8) every app renders.
 *
 * The app passes its `<Navbar />` as `header` and keeps app-side chrome
 * like `<Toaster />` outside the shell. Extra div props land on the
 * wrapper; `contentClassName` merges into the `<main>` classes.
 */
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../internal/cn";

export function PageShell({
  header,
  children,
  contentClassName,
  ...props
}: {
  /** Sticky top bar — typically `<Navbar />` (ProductNavbar pattern). */
  header?: ReactNode;
  children: ReactNode;
  /** Merged into the `<main>` container classes (e.g. widen max-w). */
  contentClassName?: string;
} & ComponentProps<"div">) {
  return (
    <div {...props}>
      {header}
      <main
        className={cn(
          "mx-auto min-h-screen max-w-6xl px-6 py-8",
          contentClassName,
        )}
      >
        {children}
      </main>
    </div>
  );
}
