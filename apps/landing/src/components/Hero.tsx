import { useEffect, useRef } from "react";

import { Waitlist } from "./Waitlist";

// §1 + §2 — Prologue (one-shot capture beats) → settled hero.
// Beats ordered by who failed: oracle → founders → courts. Each ends "Who's right?"
const beats = [
  {
    label: "ORACLE",
    when: "June 2025",
    lines: [
      "Is that a suit?",
      "UMA's oracle said yes. Then no.",
      "Token-weighted plutocracy flipped $160M on a jacket.",
    ],
  },
  {
    label: "FOUNDERS",
    when: "June 2016",
    lines: [
      "An attacker drains The DAO.",
      "The code allowed it. Ethereum's founders rewind the chain.",
      "Code is law — or isn't it?",
    ],
  },
  {
    label: "COURTS",
    when: "October 2022",
    lines: [
      "Avi Eisenberg drains $114M from Mango.",
      "The code allowed every trade. Convicted 2024 — vacated 2025.",
      "Four courts, four answers.",
    ],
  },
];

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  // One-shot prologue → settle. Respects reduced-motion (the boot script in
  // index.html already settled those visitors). Dies on scroll / Escape so no
  // visitor is trapped. Scoped to this section; cleanup cancels via the token.
  useEffect(() => {
    const root = document.documentElement;
    const section = sectionRef.current;
    if (!section || root.classList.contains("is-settled")) return;

    const beats = Array.from(section.querySelectorAll<HTMLElement>("[data-beat]"));
    const replay = section.querySelector<HTMLButtonElement>("[data-replay]");
    const BEAT = 3000; // ms each beat held
    const FADE = 540; // crossfade gap between beats
    const TAIL = 500; // pause after the last beat before settling
    let token = 0;
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const showBeat = (i: number) =>
      beats.forEach((b, idx) => {
        if (idx === i) b.setAttribute("data-active", "");
        else b.removeAttribute("data-active");
      });

    const settle = () => {
      token++;
      root.classList.add("is-settled");
      if (replay) replay.hidden = false;
    };

    async function play() {
      const my = ++token;
      root.classList.remove("is-settled");
      if (replay) replay.hidden = true;
      beats.forEach((b) => b.removeAttribute("data-active"));
      await wait(140);
      if (my !== token) return;
      for (let i = 0; i < beats.length; i++) {
        showBeat(i);
        await wait(BEAT);
        if (my !== token) return;
        beats[i]?.removeAttribute("data-active");
        await wait(FADE);
        if (my !== token) return;
      }
      await wait(TAIL);
      if (my !== token) return;
      settle();
    }

    const bail = () => settle();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") bail();
    };
    const onReplay = () => {
      window.scrollTo({ top: 0, behavior: "auto" });
      play();
    };

    window.addEventListener("scroll", bail, { once: true, passive: true });
    window.addEventListener("keydown", onKey);
    replay?.addEventListener("click", onReplay);
    play();

    return () => {
      token++;
      window.removeEventListener("scroll", bail);
      window.removeEventListener("keydown", onKey);
      replay?.removeEventListener("click", onReplay);
    };
  }, []);

  return (
    <section
      id="hero"
      ref={sectionRef}
      data-hero
      className="relative isolate flex min-h-[100svh] flex-col justify-center overflow-hidden"
    >
      <div aria-hidden="true" className="grid-texture pointer-events-none absolute inset-0 -z-10"></div>

      {/* Prologue stage: animated, visual-only. CSS shows it while .js && !.is-settled. */}
      <div data-prologue-stage aria-hidden="true">
        {beats.map((b, i) => (
          <article key={b.label} data-beat data-active={i === 0 ? "" : undefined} className="max-w-2xl px-6 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-amber sm:text-sm">
              {b.label}
              <span className="text-muted-foreground/70">{" · "}{b.when}</span>
            </p>
            <div className="mt-6 space-y-3 font-sans text-2xl leading-snug text-nearwhite sm:text-3xl">
              {b.lines.map((ln) => (
                <p key={ln}>{ln}</p>
              ))}
            </div>
            <p className="mt-9 font-sans text-3xl font-medium text-amber sm:text-4xl">Who's right?</p>
          </article>
        ))}
      </div>

      {/* Settled hero — left-biased editorial (escapes the centered-AI-hero template) */}
      <div data-hero-main className="mx-auto w-full max-w-5xl px-6 text-left">
        <h1 className="max-w-xl font-sans text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-nearwhite sm:text-6xl md:text-7xl">
          Mechanize the verdict.
        </h1>
        <p className="mt-5 max-w-xl text-base text-muted-foreground">Justice is infrastructure.</p>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
          Two CPI calls — <code className="font-mono text-amber">create_dispute()</code> →
          <code className="font-mono text-amber">get_ruling()</code>. Any Solana program gets trustless
          dispute resolution. Jurors are secret, drawn by VRF, slashed for incoherence. Capture is
          structurally impossible.
        </p>

        <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Waitlist />
          <a
            href="https://docs.useaccord.xyz"
            className="font-sans text-sm text-body underline-offset-4 transition-colors hover:text-nearwhite hover:underline"
          >
            Read the docs →
          </a>
        </div>

        {/* Reduced-motion / screen-reader cases: the argument without the motion. */}
        <ol className="mt-12 max-w-xl space-y-2 text-left font-mono text-xs text-muted-foreground sr-only motion-reduce:not-sr-only">
          {beats.map((b) => (
            <li key={b.label}>
              <span className="text-amber">{b.label}</span>{" — "}{b.when}: {b.lines[0]}
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        data-replay
        hidden
        className="font-mono text-xs text-muted-foreground transition-colors hover:text-nearwhite"
      >
        ↻ Replay
      </button>
    </section>
  );
}
