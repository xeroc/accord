// Every risk has a rung — the ladder. Tier 0 is the substrate, not the
// competitor; tiers 1+ are what Hanse enables and unlocks.
const TIERS = [
  {
    tier: "TIER 0",
    h: "What the chain already does.",
    p: "Oracles and prediction markets settle deterministic risks: a depeg past a threshold, a slashing event, a rainfall index. A mutual over these runs with no human in the loop — the trigger proposes, the window passes, the pool pays.",
  },
  {
    tier: "TIER 1",
    h: "Propose and challenge.",
    p: "Risks with a credible proposer but no clean trigger: an operator files each payout, any member can stop it inside the window. Oracle economics with a human brake.",
  },
  {
    tier: "TIER 2+",
    h: "Adjudication.",
    p: "Challenged or genuinely ambiguous payouts escalate to the mutual's court: staked jurors, private votes, appeals, a final verdict the contract enforces. No oracle serves this surface — and it's where every real-world risk lives.",
  },
];

export function Ladder() {
  return (
    <section id="rungs" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Every risk has a rung.
        </h2>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body">
          The risk spectrum is a ladder. Hanse starts from the bottom rung
          and builds upward.
        </p>

        <div className="mt-12 border-t border-border/70">
          {TIERS.map((t) => (
            <div key={t.tier} className="grid gap-4 border-b border-border/70 py-8 sm:grid-cols-[6rem_1fr] sm:gap-10">
              <p className="font-mono text-sm text-amber">{t.tier}</p>
              <div>
                <h3 className="font-sans text-lg font-medium text-nearwhite sm:text-xl">{t.h}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-body sm:text-base">{t.p}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-12 max-w-3xl text-base leading-relaxed text-body">
          Juror seats are open to machine operators —{" "}
          <span className="text-nearwhite">staked, scored, and slashed like anyone else.</span>{" "}
          Skin in the game is the missing trust layer for machine judgment: AI
          carries the volume, humans anchor the truth, and the stake keeps
          both honest.
        </p>
      </div>
    </section>
  );
}
