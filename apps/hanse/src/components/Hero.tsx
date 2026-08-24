import { Backdrop, useWallClockFrame } from "@useaccord/ui";

import { Waitlist } from "./Waitlist";

// Hero — the campaign line, the one-paragraph product, the status strip.
// Settled editorial layout on the shared ambient Backdrop (no prologue —
// the landing app's beat sequence is Accord's story, not Hanse's).
const STATUS = [
  { label: "Payment rail: live on mainnet", live: true },
  { label: "Dispute layer: live on devnet", live: true },
  { label: "Mutual contract: in implementation, pre-audit", live: false },
];

export function Hero() {
  const backdropFrame = useWallClockFrame({ fps: 30 });

  return (
    <section
      id="hero"
      className="relative isolate flex min-h-[92svh] flex-col justify-center overflow-hidden"
    >
      <Backdrop frame={backdropFrame} seed="hanse-hero" className="-z-10" aria-hidden={true} />
      <div className="mx-auto w-full max-w-5xl text-left">
        <div className="max-w-2xl font-sans text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-primary">
          Hanse
        </div>
        <div className="flex flex-col mb-5 max-w-xl text-base text-muted-foreground">
          <span className="font-mono text-sm mb-2 rounded-md inline-block1">/hanz/</span>
        </div>
        <h1 className="max-w-2xl font-sans text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-nearwhite sm:text-6xl md:text-7xl">
          The protocol for mutuals.
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body sm:text-xl">
          Hanse is an open protocol on Solana for member-funded cover pools.
          Members contribute on a schedule. Contested payouts go to a jury the
          mutual itself defines. Surplus flows back to the people who funded
          it.
        </p>

        <div className="mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Waitlist />
          <a
            href="https://docs.useaccord.xyz"
            className="font-sans text-sm text-body underline-offset-4 transition-colors hover:text-nearwhite hover:underline"
          >
            Read the specification →
          </a>
        </div>

        <ul className="mt-12 flex flex-col gap-2 font-mono text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          {STATUS.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${s.live ? "bg-confirm" : "bg-amber"}`}></span>
              {s.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
