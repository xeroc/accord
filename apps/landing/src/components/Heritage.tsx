// §5 — Heritage, not hype. Credibility without traction claims (pre-launch integrity).
const lineage = [
  { year: "1960", name: "Schelling", body: "Independent agents converge on the obvious answer without communication." },
  { year: "~500 BCE", name: "Athenian sortition", body: "Draw the judges by lot. A committee can be captured; a random sample can't be bought in advance." },
  { year: "2019", name: "Kleros", body: "A Schelling-point court, 1,000+ disputes on Ethereum. Proof the mechanism works. The precedent, not the template." },
  { year: "now", name: "Accord", body: "The same economics, packaged as a composable Solana primitive." },
];

export function Heritage() {
  return (
    <section id="heritage" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-amber">Lineage</p>
        <h2 className="mt-4 max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          The math is old. The Solana primitive is new.
        </h2>

        <ol className="mt-12 divide-y divide-border/70 border-y border-border/70">
          {lineage.map((l) => (
            <li key={l.year + l.name} className="grid gap-2 py-6 sm:grid-cols-[8rem_1fr] sm:gap-8">
              <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                <span className="font-mono text-sm text-amber">{l.year}</span>
                <span className="font-sans text-base font-medium text-nearwhite">{l.name}</span>
              </div>
              <p className="text-sm leading-relaxed text-body sm:text-base">{l.body}</p>
            </li>
          ))}
        </ol>

        <p className="mt-12 max-w-2xl font-sans text-xl text-nearwhite sm:text-2xl">
          Truth doesn't need a referee — it needs a mechanism that rewards it.
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          We claim the mechanism. We don't claim traction — v1 is the build target.
        </p>
      </div>
    </section>
  );
}
