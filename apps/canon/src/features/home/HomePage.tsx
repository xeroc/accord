/**
 * Home — landing route (`/`).
 *
 * Left-biased hero (Canon identity + Create-list CTA) that reuses ListBrowser
 * for the live list grid + featured slot. Content is left-aligned, not
 * centered-everything (DESIGN.md §08). Mirrors apps/app's HomePage shape.
 * see milestone §10.
 */
import { Link } from "react-router-dom";
import { CanonLogo } from "@/components/canon-logo";
import { ListBrowser } from "@/features/list/ListBrowser";

export function HomePage() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col items-start gap-3">
        <CanonLogo className="size-10" />
        <h1 className="text-3xl font-bold tracking-tight">Canon.</h1>
        <p className="max-w-prose text-sm text-text-secondary">
          Curated registries adjudicated by Accord courts. Submit items.
          Challenge fakes. Let an honest jury decide what stays.
        </p>
        <Link to="/lists/new" className="cta">
          Create a list.
        </Link>
      </header>

      <ListBrowser />
    </div>
  );
}
