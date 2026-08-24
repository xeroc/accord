// The demand: the oldest protection structure, failed on-chain.
// Numbers only from the messaging guide's proof-point ledger, cited.
const stats = [
  {
    value: "26%",
    label: "of world cover is already mutual: $1.6T across 4,700+ societies",
    cite: "ICMIF 2024",
  },
  {
    value: "$3.4B+",
    label: "stolen in crypto through early December 2025, recurring annually",
    cite: "Chainalysis 2025",
  },
  {
    value: "$104M",
    label: "the entire on-chain cover sector: about 84% in one project",
    cite: "DeFiLlama, Aug 2026",
  },
];

export function Category() {
  return (
    <section id="category" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-amber">The category</p>
        <h2 className="mt-4 max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          The oldest protection structure — brought on-chain.
        </h2>

        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body">
          Mutuals are people sharing a risk and a pool, centuries before
          insurance companies industrialized it. Pooling capital is the easy
          part on a blockchain but a mutual needs three machines, and every
          attempt bolted them onto a token structure that couldn't hold them.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.value} className="rounded-lg border border-border bg-raised px-6 py-5">
              <p className="font-mono text-3xl font-semibold text-nearwhite">{s.value}</p>
              <p className="mt-3 text-sm leading-relaxed text-body">{s.label}</p>
              <p className="mt-3 font-mono text-xs text-muted-foreground">{s.cite}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
