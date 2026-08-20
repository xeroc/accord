/**
 * ProductNavbar — the sticky top bar shell shared by every Accord app.
 *
 * Owns only the `<header>` chrome (sticky + backdrop-blur + hairline, IBM
 * Plex Mono per BRAND.md). Everything app-specific arrives as slots:
 * brand (wordmark `<Link>`, app-side), optional navigation, wallet/cluster
 * account controls (app-side), and optional mobile navigation.
 *
 * Boundary: no router, no wallet — the Link and connector hooks stay in
 * app navbar files.
 */
import type { ReactNode } from "react";

import { cn } from "../internal/cn";

export function ProductNavbar({
  brand,
  navigation,
  accountControls,
  mobileNavigation,
  className,
}: {
  /** Wordmark + glyph, links home. App-owned (`<Link>` stays app-side). */
  brand: ReactNode;
  /** Inline nav links, rendered left of the account controls. */
  navigation?: ReactNode;
  /** Cluster selector + wallet connect/disconnect (app-owned logic). */
  accountControls?: ReactNode;
  /** Optional mobile nav, rendered below the desktop bar. */
  mobileNavigation?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between bg-card/80 px-6 py-3 font-mono backdrop-blur-xl supports-[backdrop-filter]:bg-card/70 [@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none",
        className,
      )}
    >
      {brand}
      <div className="flex items-center gap-3">
        {navigation}
        {accountControls}
      </div>
      {mobileNavigation}
    </header>
  );
}
