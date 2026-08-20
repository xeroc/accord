import { AccordMark, AmberRule } from "@useaccord/ui";

import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { CHAPTERS } from "./chapters";

// How it Rules — the hub. Six films, one per primitive. The pun is the
// product: Accord rules on disputes; these chapters show how it rules.

export function HowItRules() {
  return (
    <>
      <Nav />
      <main>
        <section className="mx-auto max-w-5xl px-6 pt-24 pb-20">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-amber">
            How it Rules · six films
          </p>
          <h1 className="mt-5 font-heading text-6xl font-bold leading-none text-nearwhite">
            Accord issues rulings.
            <br />
            Here is how it rules.
          </h1>
          <AmberRule enter={1} className="mt-8 w-56" />
          <p className="mt-8 max-w-2xl text-lg text-text-secondary">
            Six short films, one per primitive — the draw, the vote, the
            economics, the evidence, and the failure modes. No narration, no
            jargon walls: each chapter is the mechanism itself, in motion.
            When a film ends, the prose picks up where it stopped.
          </p>
        </section>

        <section aria-label="Chapters" className="mx-auto max-w-5xl px-6 pb-24">
          <ol className="grid gap-6 sm:grid-cols-2">
            {CHAPTERS.map((c, i) => (
              <li key={c.slug}>
                <a
                  href={`/how-it-rules/${c.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-raised transition-colors hover:border-amber/50"
                >
                  <div className="relative aspect-video overflow-hidden border-b border-border/60">
                    <img
                      src={`/how-it-rules/${c.slug}.jpg`}
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
                </a>
              </li>
            ))}
          </ol>

          <div className="mt-16 flex items-center gap-4 border-t border-border/60 pt-10">
            <AccordMark size={28} progress={1} className="text-amber" />
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
      </main>
      <Footer />
    </>
  );
}
