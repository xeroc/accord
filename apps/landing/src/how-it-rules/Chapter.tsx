import { AmberRule } from "@useaccord/ui";

import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { CHAPTERS, type Chapter } from "./chapters";

// How it Rules — one chapter: kicker, the film, what you just watched,
// the prose that continues it, and the chapter ladder.

export function ChapterPage({ chapter }: { chapter: Chapter }) {
  const index = CHAPTERS.findIndex((c) => c.slug === chapter.slug);
  const prev = index > 0 ? CHAPTERS[index - 1] : undefined;
  const next = index < CHAPTERS.length - 1 ? CHAPTERS[index + 1] : undefined;

  return (
    <>
      <Nav />
      <main>
        <article className="mx-auto max-w-5xl px-6 pt-24 pb-16">
          <a
            href="/how-it-rules"
            className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:text-nearwhite"
          >
            ← How it Rules
          </a>
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.3em] text-amber">
            How it Rules · Chapter {index + 1} of {CHAPTERS.length} · {chapter.duration}
          </p>
          <h1 className="mt-5 font-heading text-6xl font-bold leading-none text-nearwhite">
            {chapter.title}
          </h1>
          <AmberRule enter={1} className="mt-8 w-40" />
          <p className="mt-8 max-w-2xl text-lg text-text-secondary">{chapter.blurb}</p>

          <figure className="mt-12">
            <video
              controls
              preload="metadata"
              poster={`/how-it-rules/${chapter.slug}.jpg`}
              className="aspect-video w-full rounded-lg border border-border/60 bg-ink"
            >
              <source src={`/how-it-rules/${chapter.slug}.mp4`} type="video/mp4" />
              <p className="p-6 font-mono text-sm text-text-secondary">
                Your browser can't play this film — it's at{" "}
                <a href={`/how-it-rules/${chapter.slug}.mp4`} className="text-amber">
                  /how-it-rules/{chapter.slug}.mp4
                </a>
                .
              </p>
            </video>
            <figcaption className="mt-3 font-mono text-xs text-muted-foreground">
              {chapter.kicker} · {chapter.duration} · 1920×1080
            </figcaption>
          </figure>

          <section aria-label="What you just watched" className="mt-14 max-w-2xl">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              What you just watched
            </h2>
            <ul className="mt-5 flex flex-col gap-3">
              {chapter.takeaways.map((t) => (
                <li key={t} className="flex gap-3 text-base leading-relaxed text-body">
                  <span aria-hidden className="mt-[0.65em] h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
                  {t}
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Keep reading" className="mt-12 max-w-2xl border-t border-border/60 pt-8">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
              Keep reading
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {chapter.reading.map((r) => (
                <li key={r.href}>
                  <a
                    href={`https://docs.useaccord.xyz${r.href}`}
                    className="inline-block rounded-full border border-border-subtle bg-raised px-4 py-2 font-mono text-sm text-text-secondary transition-colors hover:border-amber/50 hover:text-amber"
                  >
                    {r.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </article>

        <nav
          aria-label="Chapter navigation"
          className="mx-auto max-w-5xl px-6 grid gap-4 border-t border-border/60 py-10 sm:grid-cols-2"
        >
          {prev ? (
            <a
              href={`/how-it-rules/${prev.slug}`}
              className="rounded-lg border border-border/60 bg-raised p-5 transition-colors hover:border-amber/50"
            >
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                ← Previous
              </p>
              <p className="mt-2 font-heading text-xl font-bold text-nearwhite">{prev.title}</p>
            </a>
          ) : (
            <span aria-hidden />
          )}
          {next ? (
            <a
              href={`/how-it-rules/${next.slug}`}
              className="rounded-lg border border-border/60 bg-raised p-5 text-right transition-colors hover:border-amber/50 sm:col-start-2"
            >
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Next →
              </p>
              <p className="mt-2 font-heading text-xl font-bold text-nearwhite">{next.title}</p>
            </a>
          ) : (
            <a
              href="https://docs.useaccord.xyz/quickstart/"
              className="rounded-lg border border-amber/40 bg-amber/5 p-5 text-right transition-colors hover:border-amber/60 sm:col-start-2"
            >
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
                That's the mechanism →
              </p>
              <p className="mt-2 font-heading text-xl font-bold text-amber">Build on it</p>
            </a>
          )}
        </nav>
      </main>
      <Footer />
    </>
  );
}
