// From sharing circle to carrier — the capital model, minus the
// shareholder.
const POINTS = [
  {
    h: "The reserve is staked capital earning a transparent share of the surplus.",
    p: "The pool balance, every payout, and every split are public facts. The yield is verifiable, not an actuarial promise.",
  },
  {
    h: "Exit costs are fixed at creation and immutable.",
    p: "Governance can never trap capital by raising them.",
  },
  {
    h: "Mutuals stack.",
    p: "A mutual can buy cover from another mutual — the front pool takes first loss, the back pool takes the tail. Tranching through stacked mutuals, each layer staked and priced on its own terms.",
  },
];

export function Capital() {
  return (
    <section id="capital" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          From sharing circle to carrier.
        </h2>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body">
          Run lean, a mutual is a sharing circle: members in, payouts out,
          nothing in between. Configure it with priced contributions, a staked
          reserve, and a court, and it does everything a carrier does — minus
          the shareholder.
        </p>

        <div className="mt-12 border-t border-border/70">
          {POINTS.map((p) => (
            <div key={p.h} className="border-b border-border/70 py-8">
              <h3 className="max-w-2xl font-sans text-lg font-medium text-nearwhite sm:text-xl">{p.h}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body sm:text-base">{p.p}</p>
            </div>
          ))}
        </div>

        <p className="mt-12 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          The licensed sector spends 20–40 cents of every collected dollar on
          distribution and administration (Georgetown CHIR). Here, the
          operations are the chain itself.
        </p>
      </div>
    </section>
  );
}
