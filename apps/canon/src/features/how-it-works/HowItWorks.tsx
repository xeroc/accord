/**
 * How it works — the hub. Five films, one per Canon primitive. Mirrors the
 * landing's How-it-Rules hub (apps/landing/src/how-it-rules/HowItRules.tsx):
 * poster-card grid, kit tokens only, no hand-rolled colors.
 */
import { Link } from "react-router-dom";
import { AmberRule } from "@useaccord/ui";

import { CanonLogo } from "@/components/canon-logo";
import { CHAPTERS } from "./chapters";

export function HowItWorks() {
  return (
    <div className="space-y-8">
      <header className="flex flex-col items-start gap-3 pt-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber">
          How it works · five films
        </p>
        <h1 className="font-heading text-5xl font-bold leading-none text-nearwhite">
          The list defends itself.
          <br />
          Here is how it works.
        </h1>
        <AmberRule enter={1} className="mt-4 w-56" />
        <p className="mt-4 max-w-2xl text-base text-text-secondary">
          Five short films — the list, the item, the challenge, the
          economics. No narration, no jargon walls: each film is the
          mechanism itself, in motion. When a film ends, the prose picks up
          where it stopped.
        </p>
      </header>

      <section aria-label="Chapters">
        <ol className="grid gap-6 sm:grid-cols-2">
          {CHAPTERS.map((c, i) => (
            <li key={c.slug}>
              <Link
                to={`/how-it-works/${c.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-raised transition-colors hover:border-amber/50"
              >
                <div className="relative aspect-video overflow-hidden border-b border-border/60">
                  <img
                    src={`/how-it-works/${c.slug}.jpg`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
                  />
                  <span className="absolute left-4 top-4 rounded-full bg-ink/80 px-3 py-1 font-mono text-xs tracking-widest text-amber backdrop-blur">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="absolute bottom-4 right-4 rounded-full bg-ink/80 px-3 py-1 font-mono text-xs text-muted-foreground backdrop-blur">
                    {c.duration}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-6">
                  <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                    {c.kicker}
                  </p>
                  <h2 className="font-heading text-2xl font-bold text-nearwhite">
                    {c.title}
                  </h2>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {c.blurb}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ol>

        <div className="mt-12 flex items-center gap-4 border-t border-border/60 pt-8">
          <CanonLogo className="size-7 text-amber" />
          <p className="font-mono text-sm text-muted-foreground">
            Rather build than watch?{" "}
            <a
              href="https://docs.useaccord.xyz/quickstart/"
              className="text-amber underline-offset-4 hover:underline"
            >
              File a dispute in five commands →
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
