// Three machines, no company — the diagnosis, with the honest status of
// each protocol (status ledger, messaging guide §6).
const MACHINES = [
  {
    n: "01",
    machine: "Collect recurring contributions",
    role: "the payment rail",
    body: "On-chain money couldn't do \u201ccharge monthly\u201d without handing keys to a custodian, so subscription economics never arrived. The rail does non-custodial recurring pull payments: approve once, payments execute automatically within limits.",
    status: "LIVE · SOLANA MAINNET",
    live: true,
  },
  {
    n: "02",
    machine: "Decide contested payouts",
    role: "the dispute layer",
    body: "Every survivor routes payouts through a trusted committee, a token vote, or nothing at all, and whoever controls that decision controls the pool. The dispute layer replaces the committee with a staked jury: randomly drawn, privately voting, slashed for incoherent votes, appealable.",
    status: "LIVE · DEVNET",
    live: true,
  },
  {
    n: "03",
    machine: "Pool capital and pay payouts",
    role: "the mutual contract",
    body: "Shared pools covering many unrelated risks at once death-spiraled: idle capital earns nothing, capital leaves, the pool can't pay. The mutual contract enforces what promises couldn't: one risk per pool, books that close once per period, payouts that share the pool equally.",
    status: "IN IMPLEMENTATION · PRE-AUDIT",
    live: false,
  },
];

export function Machines() {
  return (
    <section id="machines" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Three machines. Prerequisit for on-chain mutuals.
        </h2>

        <div className="mt-12 border-t border-border/70">
          {MACHINES.map((m) => (
            <div key={m.n} className="grid gap-4 border-b border-border/70 py-8 sm:grid-cols-[3.5rem_1fr] sm:gap-10">
              <p className="font-mono text-sm text-amber">{m.n}</p>
              <div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h3 className="font-sans text-lg font-medium text-nearwhite sm:text-xl">{m.machine}</h3>
                  <span className="font-mono text-sm text-muted-foreground">→ {m.role}</span>
                  <span
                    className={`ml-auto rounded-full border px-3 py-1 font-mono text-xs ${m.live
                      ? "border-confirm/40 bg-confirm/10 text-confirm"
                      : "border-amber/40 bg-amber/10 text-amber"
                      }`}
                  >
                    {m.status}
                  </span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body sm:text-base">{m.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-14 text-center font-sans text-2xl font-medium tracking-[-0.01em] text-nearwhite sm:text-3xl">
          Each protocol solves exactly one problem. We are building them in the order the mutual needs them.
        </p>
      </div>
    </section>
  );
}
