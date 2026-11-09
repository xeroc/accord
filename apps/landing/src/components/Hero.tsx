import { Backdrop, CaseFiles, useWallClockFrame } from "@useaccord/ui";

/** The arXiv wordmark — italic serif, arXiv red — so the hosting is visible
 * at a glance, not just implied by the URL. */
function ArxivMark() {
  return (
    <a href="https://arxiv.org/abs/2610.20666"
      target="_blank" rel="noopener noreferrer"
      className="group inline-flex items-center gap-2.5 rounded-md border border-zinc-700/60 bg-zinc-900/70 px-4 py-2.5 font-sans text-sm font-medium text-zinc-300 no-underline shadow-[0_2px_12px_rgba(0,0,0,0.2)] backdrop-blur-md hover:border-zinc-500/70 hover:bg-zinc-800/90 hover:text-white hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">

      <svg viewBox="0 0 40 12" aria-hidden="true"
        className="h-3 w-auto shrink-0">
        <text x="0" y="10.5"
          fill="#C74646"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fontSize="12">arXiv</text>
      </svg>

      <span>Whitepaper</span>

      <svg viewBox="0 0 16 16" aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-zinc-500 group-hover:text-zinc-200">
        <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round" />
      </svg>
    </a>
  );
}


// §1 — Settled hero, shown immediately. The hook carries the belief (WHY);
// the subhead carries the WHAT in plain words — the mechanism (HOW) lives
// in its own section. The three failure cases live as animated case files
// beside the hero (kit CaseFiles — frame contract, anonymized: Kleros is
// the only citable project).
export function Hero() {
  // One wall-clock loop drives both the ambient canvas and the case files.
  const frame = useWallClockFrame({ fps: 30 });

  return (
    <section
      id="hero"
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden"
    >
      {/* The shared ambient canvas (ledger grid · juror field · verdict
          glow · vignette) — the same Backdrop the videos run on,
          wall-clock driven; frozen for reduced-motion visitors. */}
      <Backdrop frame={frame} seed="landing-hero" className="-z-10" aria-hidden={true} />

      <div className="mx-auto grid w-full max-w-6xl gap-16 px-6 py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-24">
        {/* Left: the argument. Belief first, mechanism one line below. */}
        <div>
          <p className="font-mono text-sm text-amber">Mechanize the verdict.</p>
          <h1 className="mt-5 max-w-xl font-sans text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-nearwhite sm:text-6xl md:text-7xl">
            Make honesty the equilibrium.
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-body sm:text-xl">
            Accord is a court any app can call. The jury is drawn at random, honest votes
            get paid, dishonest ones lose stake.
          </p>

          <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <a
              href="https://docs.useaccord.xyz"
              className="rounded-md bg-amber px-5 py-3 font-sans text-sm font-medium text-ink transition-opacity hover:opacity-90"
            >
              Read the docs
            </a>
            <ArxivMark />
          </div>
        </div>

        {/* Right: the three cases no committee settles the same way twice. */}
        <div
          className="flex flex-col items-center lg:items-end"
          aria-label="Three disputes that ended differently depending on who answered"
        >
          <CaseFiles frame={frame} />
        </div>
      </div>
    </section>
  );
}
