// §4 — Why it can't be captured. The three structural moats + antagonist stat.
const pillars = [
  {
    n: "01",
    h: "Secret. Drawn by VRF. Slashed.",
    p: "Jurors don't exist until the dispute. Drawn by verifiable random function, secret through commit-reveal, slashed for incoherent votes. No standing committee to bribe. No token stash buys the verdict.",
  },
  {
    n: "02",
    h: "Honesty is the profitable strategy.",
    p: "The Schelling Point for a subjective question is truth. Vote your honest belief and it pays. Lie and you bet against everyone's incentive to be obvious.",
  },
  {
    n: "03",
    h: "Two CPI calls. One commit.",
    p: "Any Solana program. No SDK to learn, no governance token to acquire, no committee to brief. The cost of switching to Accord is roughly zero.",
  },
];

export function Capture() {
  return (
    <section id="capture" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Capture is structurally impossible.
        </h2>

        <div className="mt-12 border-t border-border/70">
          {pillars.map((p) => (
            <div key={p.n} className="grid gap-4 border-b border-border/70 py-8 sm:grid-cols-[3.5rem_1fr] sm:gap-10">
              <p className="font-mono text-sm text-amber">{p.n}</p>
              <div>
                <h3 className="font-sans text-lg font-medium text-nearwhite sm:text-xl">{p.h}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body sm:text-base">{p.p}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-14 text-center font-sans text-2xl font-medium tracking-[-0.01em] text-nearwhite sm:text-3xl">
          An accord, not a committee.
        </p>

        <div className="mx-auto mt-12 max-w-3xl rounded-lg border border-slash/30 bg-slash/5 px-6 py-5">
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-slash">The failure mode, named</p>
          <p className="mt-2 text-sm leading-relaxed text-body sm:text-base">
            March 2025 — one actor with <span className="font-mono text-nearwhite">25%</span> of UMA tokens
            flipped a <span className="font-mono text-nearwhite">$7M</span> Polymarket contract. Token-weighted
            voting is plutocracy. Accord removes the attack surface.
          </p>
        </div>
      </div>
    </section>
  );
}
