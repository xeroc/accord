// How a mutual runs — the six verbs, one risk per pool.
import { PayoutPath } from "./PayoutPath";

const STEPS = [
  {
    n: "01",
    h: "Create.",
    p: "Launching a mutual is a transaction on one shared deployment: define the risk, the terms, the proposer, who may challenge, and the court. No charter. No platform gate.",
  },
  {
    n: "02",
    h: "Join.",
    p: "Members buy cover with recurring contributions through the payment rail. Coverage grows with tenure; the cost of attacking the pool scales with the cover sought.",
  },
  {
    n: "03",
    h: "Propose.",
    p: "Payouts run optimistically. A proposer — an automated trigger, a data feed, or a designated operator — files each payout with its evidence, and a challenge window opens.",
  },
  {
    n: "04",
    h: "Challenge.",
    p: "Unchallenged, the pool pays automatically. Challenged, the payout goes to the mutual's own court. Adjudication is the escalation path. You only pay for judgment when someone disputes.",
  },
  {
    n: "05",
    h: "Settle.",
    p: "Each period closes the books exactly once: every dispute final, approved payouts sharing the pool at one fixed ratio, nobody winning by racing.",
  },
  {
    n: "06",
    h: "Return.",
    p: "Surplus splits between the reserve, the stakers who back it, and the members who funded it. The split is a public fact.",
  },
];

export function HowItRuns() {
  return (
    <section id="how-it-runs" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          How a mutual runs.
        </h2>

        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <p className="font-mono text-sm text-amber">{s.n}</p>
              <h3 className="mt-2 font-sans text-lg font-medium text-nearwhite">{s.h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-body">{s.p}</p>
            </div>
          ))}
        </div>

        <p className="mt-14 max-w-2xl font-sans text-xl text-nearwhite sm:text-2xl">
          One risk, one pool.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body sm:text-base">
          Each mutual covers exactly one risk type with its own vaults.
          Isolation is structural — a pool never cross-subsidizes unrelated
          risks.
        </p>

        <PayoutPath />
      </div>
    </section>
  );
}
