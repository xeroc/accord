// FAQ — native details/summary, no JS. The vocabulary rule made visible:
// the one regulated-sector word on the page is there to be denied.
const ITEMS = [
  {
    q: "Is this insurance?",
    a: "No. It's a discretionary mutual: member-funded cover where the pool can also say no. There's no binding promise to pay: payouts are decisions of the pool's own court, and the terms say so up front. That's the same posture the surviving on-chain mutual has used since 2019.",
  },
  {
    q: "Who decides contested payouts?",
    a: "A jury the mutual itself defines. Members configure who may serve, the ruling options, stage durations, and appeal depth. Jurors stake capital and lose it for voting against the evident truth.",
  },
  {
    q: "What stops the pool from running out?",
    a: "Two funds, in order: the contribution fund takes first loss, the staked reserve takes the rest. If both fall short, the period settles at one pro-rata ratio: honest, deterministic, equal. No first-come-first-served races, ever.",
  },
  {
    q: "Can anyone launch a mutual?",
    a: "Yes, it's a transaction on one shared deployment. One risk per pool, your own tokens, your own terms, your own court.",
  },
  {
    q: "What do stakers earn?",
    a: "A transparent share of the period's surplus, pro-rata by stake and time. The book is public; the split is public.",
  },
  {
    q: "What's the business model?",
    a: "The protocol takes a share of positive pool surplus: it earns when the mutual does. No governance token anywhere.",
  },
  {
    q: "What's audited?",
    a: "Nothing yet. Audits are the next step for the mutual contract and the dispute layer, before any mainnet capital sits on them. The payment rail is live on mainnet today.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Questions, answered plainly.
        </h2>

        <div className="mt-12 border-t border-border/70">
          {ITEMS.map((item) => (
            <details key={item.q} className="group border-b border-border/70">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-sans text-base font-medium text-nearwhite transition-colors hover:text-amber sm:text-lg [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="font-mono text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-2xl pb-6 text-sm leading-relaxed text-body sm:text-base">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
