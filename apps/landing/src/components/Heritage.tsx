// §5 — Heritage, not hype. Credibility without traction claims. Each stop
// in the lineage links to the source math — Kleros is the only project
// cited (category precedent), everything else is theory.
const lineage = [
  {
    year: "~500 BCE",
    name: "Athenian sortition",
    href: "https://en.wikipedia.org/wiki/Sortition",
    body: "Draw the judges by lot. A committee can be captured; a random sample can't be bought in advance.",
  },
  {
    year: "1785",
    name: "Condorcet",
    href: "https://en.wikipedia.org/wiki/Condorcet%27s_jury_theorem",
    body: "If each juror is likelier right than wrong, the majority converges on truth as the panel grows.",
  },
  {
    year: "1950",
    name: "Nash",
    href: "https://en.wikipedia.org/wiki/Nash_equilibrium",
    body: "Payoffs settle where no juror gains by deviating alone. Design the incentives, get the verdict.",
  },
  {
    year: "1960",
    name: "Schelling",
    href: "https://en.wikipedia.org/wiki/Focal_point_(game_theory)",
    body: "Independent agents converge on the obvious answer without communication.",
  },
  {
    year: "2019",
    name: "Kleros",
    href: "https://kleros.io",
    body: "A Schelling-point court, 1,000+ disputes settled on Ethereum. The economics are proven.",
  },
  {
    year: "now",
    name: "Accord",
    body: "The same economics, packaged as a composable Solana primitive.",
  },
] as const;

export function Heritage() {
  return (
    <section id="heritage" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-amber">Lineage</p>
        <h2 className="mt-4 max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Old math, new primitive.
        </h2>

        <ol className="mt-12 divide-y divide-border/70 border-y border-border/70">
          {lineage.map((l) => (
            <li key={l.year + l.name} className="grid gap-2 py-6 sm:grid-cols-[8rem_1fr] sm:gap-8">
              <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                <span className="font-mono text-sm text-amber">{l.year}</span>
                {"href" in l && l.href ? (
                  <a
                    href={l.href}
                    className="font-sans text-base font-medium text-nearwhite underline-offset-4 transition-colors hover:text-amber hover:underline"
                    rel="noopener"
                  >
                    {l.name}
                  </a>
                ) : (
                  <span className="font-sans text-base font-medium text-nearwhite">{l.name}</span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-body sm:text-base">{l.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-12 max-w-2xl font-sans text-xl text-nearwhite sm:text-2xl">
          The mechanism pays you to tell the truth.
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          We claim the mechanism. We don't claim traction. Live on mainnet, unaudited.
        </p>

        {/* The paper — the credibility artifact. Numbers attributed to it,
            never claimed as traction. */}
        <div className="mt-10 max-w-2xl rounded-lg border border-border bg-raised px-6 py-5">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Written up
          </p>
          <p className="mt-2 text-sm leading-relaxed text-body sm:text-base">
            The draw math, the incentive model, and the price of capture — holding a wrong
            verdict through the full appeal ladder means buying 30 juror seats — are
            published as a paper.{" "}
            <a
              href="https://arxiv.org/abs/2610.20666"
              className="text-amber underline-offset-4 hover:underline"
              rel="noopener"
            >
              Read it on arXiv
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
