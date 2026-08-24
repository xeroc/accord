import type { FC } from "react";

import {
  AccordMark,
  AmberRule,
  LedgerCounter,
  MonoChip,
  PanelLadder,
  PayoutFlow,
  Wordmark,
} from "@useaccord/ui";

import { SlideFrame } from "./shell";
import { useSlideFrame } from "./useSlideFrame";

/**
 * The demo-day deck, from meta/PITCH-MUTUAL.md (mutual-led ordering,
 * market-first: the ICMIF mutual-economy numbers set the TAM, the
 * developed/emerging split sets the wedge, and the near-future /
 * vision framing positions on-chain mutuals now and insurance as the
 * road). The primitives stay de-named on stage ("the payment rail",
 * "the dispute layer"); regulated-sector words describe the market we
 * compare against, never our product. Every mechanism visual is a
 * ui-kit piece driven by the slide-local frame clock.
 */

/** Rise style for frame-gated reveals: clamped progress in the
 * [start, start + dur] frame window, opacity + settle translate. */
const rise = (frame: number, start: number, dur = 18) => {
  const p = Math.min(1, Math.max(0, (frame - start) / dur));
  return { opacity: p, transform: `translateY(${(1 - p) * 12}px)` };
};

/* 01 — title ---------------------------------------------------------------- */

const TitleSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-10">
      <AccordMark size={128} progress={Math.min(1, frame / 45)} />
      <div data-rise className="flex flex-col items-center gap-6">
        <Wordmark enter={Math.min(1, Math.max(0, (frame - 18) / 30))} className="text-8xl" brandName="Hanse" />
        <div className="font-heading text-5xl font-bold tracking-tight text-nearwhite">
          Mutuals as an open protocol.
        </div>
        <img
          src="mtndao.svg"
          alt="mtnDAO"
          className="h-11 opacity-90 mt-8"
          style={rise(frame, 66)}
        />
      </div>
    </div>
  );
};

/* 02 — the mutual market ------------------------------------------------------ */

const MarketSlide: FC = () => {
  const frame = useSlideFrame();
  const row = (
    label: string,
    to: number,
    at: number,
    tone: "confirm" | "amber" | "neutral",
  ) => (
    <LedgerCounter
      frame={frame}
      label={label}
      from={0}
      to={to}
      at={at}
      dur={40}
      tone={tone}
      className="text-4xl"
    />
  );
  const facts = [
    "record premiums, grown faster than the total market",
    "40%+ national share in the US, France, and Germany",
    "26% share held for a decade",
  ];
  return (
    <SlideFrame kicker="THE MARKET" headline="A quarter of world insurance is mutual.">
      <div className="flex max-w-8xl flex-col gap-4 font-mono">
        {row("mutual premiums written (USD, ICMIF, 2025)", 1_606_000_000_000, 30, "confirm")}
        {row("percent of the global insurance market", 26, 55, "confirm")}
        {row("members and policyholders covered", 856_000_000, 80, "confirm")}
        {row("mutual insurers, across 80 countries", 4_700, 105, "confirm")}
      </div>
      <div className="flex max-w-5xl flex-wrap gap-4">
        {facts.map((f, i) => (
          <MonoChip key={f} tone="neutral" className="px-5 py-2.5 text-xl" style={rise(frame, 110 + i * 18)}>
            {f}
          </MonoChip>
        ))}
      </div>
    </SlideFrame>
  );
};

/* 03 — where we play: mutuals now, insurance later ---------------------------- */

const PathSlide: FC = () => {
  const frame = useSlideFrame();
  const phases = [
    { text: "near term: on-chain mutuals, one pool per risk", tone: "confirm" as const },
    { text: "the vision: insurance as an open protocol", tone: "amber" as const },
  ];
  return (
    <SlideFrame kicker="WHERE WE PLAY" headline="On-chain mutuals now. Insurance down the road.">
      <div className="flex max-w-6xl flex-col gap-4 font-mono">
        <LedgerCounter
          frame={frame}
          label="market share, developed insurance markets"
          from={0}
          to={32}
          at={30}
          dur={30}
          tone="confirm"
          className="text-4xl"
        />
        <LedgerCounter
          frame={frame}
          label="market share, emerging markets"
          from={0}
          to={3}
          at={55}
          dur={30}
          tone="slash"
          className="text-4xl"
        />
      </div>
      <p className="max-w-[56ch] text-2xl leading-snug text-body">
        The model wins where its infrastructure exists. In emerging
        markets it never arrived, and is retreating, because a mutual
        needed a company to run it. We replace the company with a
        protocol.
      </p>
      <div className="flex flex-wrap gap-4">
        {phases.map((p, i) => (
          <MonoChip key={p.text} tone={p.tone} className="px-5 py-2.5 text-xl" style={rise(frame, 90 + i * 20)}>
            {p.text}
          </MonoChip>
        ))}
      </div>
    </SlideFrame>
  );
};
/* 05 — why a mutual belongs on-chain ------------------------------------------ */

const WhyOnchainSlide: FC = () => {
  const frame = useSlideFrame();
  const facts = [
    "the back office disappears: 20 to 40 cents of every licensed-sector dollar is admin",
    "launching is a transaction, not a company formation",
    "payouts land in a wallet, in minutes",
    "surplus returns verifiably to the members who funded it",
  ];
  return (
    <SlideFrame kicker="WHY ON-CHAIN" headline="A public pool is public solvency.">
      <p className="max-w-[56ch] text-3xl leading-snug text-body">
        The reserve is a contract balance anyone can read in real
        time. No opacity runs, no annual filings: solvency, every
        payout, and every split are public facts.
      </p>
      <div className="flex max-w-6xl flex-wrap gap-4">
        {facts.map((f, i) => (
          <MonoChip key={f} tone="neutral" className="px-5 py-2.5 text-xl" style={rise(frame, 60 + i * 18)}>
            {f}
          </MonoChip>
        ))}
      </div>
    </SlideFrame>
  );
};

/* 06 — the prerequisites exist ------------------------------------------------ */

const PREREQS = [
  {
    name: "payment rail",
    role: "recurring contributions, non-custodial",
    status: "LIVE · SOLANA MAINNET",
    tone: "confirm" as const,
  },
  {
    name: "dispute layer",
    role: "contested payouts, configured per mutual",
    status: "LIVE · DEVNET",
    tone: "confirm" as const,
  },
  {
    name: "mutual contract",
    role: "pooled cover and payouts",
    status: "SPEC COMPLETE · IN IMPLEMENTATION",
    tone: "amber" as const,
  },
];

const PrereqSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="BOTTOM-UP" headline="The prerequisites exist. We built them.">
      <div className="flex max-w-7xl flex-col gap-4">
        {PREREQS.map((p, i) => (
          <div
            key={p.name}
            className="flex flex-wrap items-center gap-6 rounded-lg border border-border-subtle bg-raised/60 px-8 py-5"
            style={rise(frame, 40 + i * 28)}
          >
            <MonoChip tone="neutral" className="px-5 py-2.5 text-xl">
              {p.name}
            </MonoChip>
            <span className="text-2xl text-text-secondary">{p.role}</span>
            <MonoChip
              tone={p.tone}
              className="ml-auto px-5 py-2.5 text-lg"
              style={rise(frame, 60 + i * 28)}
            >
              {p.status}
            </MonoChip>
          </div>
        ))}
      </div>
      <p className="max-w-[60ch] text-2xl leading-snug text-body">
        The same dispute layer already powers other applications,
        including a curated token registry and an N-party escrow.
        Next step: audits, before any mainnet capital sits on them.
      </p>
    </SlideFrame>
  );
};

/* 07 — the mutual machine ------------------------------------------------------ */

const MachineSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="THE MUTUAL · SPEC COMPLETE" headline="Propose. Challenge. Pay, or take it to the jury.">
      <PayoutFlow frame={frame} />
      <p className="max-w-[58ch] text-2xl leading-snug text-body">
        Unchallenged, the pool pays automatically; challenged, the
        mutual's own jury decides. The books close once per period,
        and surplus flows back to the reserve, the stakers, and the
        members.
      </p>
      <p className="font-mono text-xl text-amber">
        in implementation · hardest feedback wanted before audit
      </p>
    </SlideFrame>
  );
};

/* 08 — the adjudication ladder -------------------------------------------------- */

const LadderSlide: FC = () => {
  const frame = useSlideFrame();
  const wedges = [
    "first mutual: exploit cover, the evidence is already on-chain",
    "off-chain wedge: microinsurance",
  ];
  return (
    <SlideFrame kicker="THE PATH" headline="Start where payouts are decidable.">
      <div className="flex max-w-6xl flex-wrap items-end gap-12">
        <PanelLadder
          frame={frame}
          steps={[1, 4, 12]}
          at={40}
          stagger={26}
          labels={["tier 0 · triggers settle it", "tier 1 · propose and challenge", "tier 2 · a jury decides"]}
        />
        <p className="max-w-[48ch] text-2xl leading-snug text-body">
          Oracles and prediction markets already settle deterministic
          risks. That is tier 0, the substrate we build on.
          Tier 1 adds one human brake: any member can challenge a
          proposed payout. Tier 2 hands contested payouts to a staked
          jury. Trust compounds per correctly decided payout.
        </p>
      </div>
      <div className="flex flex-wrap gap-4">
        {wedges.map((w, i) => (
          <MonoChip key={w} tone="amber" className="px-5 py-2.5 text-xl" style={rise(frame, 110 + i * 20)}>
            {w}
          </MonoChip>
        ))}
      </div>
    </SlideFrame>
  );
};

/* 09 — the ask + brand close -------------------------------------------------- */

const AskSlide: FC = () => {
  const frame = useSlideFrame();
  const asks = [
    "feedback on the mutual spec",
    "design partner: a DeFi protocol or vault",
    "operators for off-chain risks",
    "reserve capital, at audited launch",
  ];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-10 px-[7vw] text-center">
      <div className="flex flex-col items-center gap-5" style={rise(frame, 0)}>
        <Wordmark
          enter={Math.min(1, Math.max(0, (frame) / 24))}
          settle={24}
          className="text-7xl"
          brandName="Hanse"
        />
        <AmberRule
          enter={Math.min(1, Math.max(0, (frame - 20) / 24))}
          className="h-1.5 w-56"
        />
        <div className="font-mono text-2xl text-text-secondary">The protocol for Mutuals.</div>
        <div className="font-mono text-2xl text-amber">hanse.useaccord.xyz</div>
      </div>
      <div data-rise className="flex flex-wrap justify-center gap-4 mt-8">
        {asks.map((a, i) => (
          <MonoChip key={a} tone="neutral" className="px-5 py-2.5 text-lg" style={rise(frame, 100 + i * 18)}>
            {a}
          </MonoChip>
        ))}
      </div>
    </div>
  );
};


/* ---- registry ---------------------------------------------------------------- */

export interface SlideDef {
  id: string;
  label: string;
  notes: string;
  component: FC;
}

export const SLIDES: SlideDef[] = [
  {
    id: "title",
    label: "Mutuals as a protocol",
    notes:
      "One sentence to land: mutuals as an open protocol, built bottom-up. No status chips here; the status close lives on the last slide.",
    component: TitleSlide,
  },
  {
    id: "market",
    label: "The mutual market",
    notes:
      "All figures ICMIF Global Mutual Market Share 2026 (2024 data): USD 1,606B premiums (record; 2023: 1,498B), 26.1% of the global market (total market USD 6,136B), 856M members/policyholders, 4,700+ mutuals across 80 countries. Mutual premium growth 7.2% outpaced the total market. 40%+ national share in the US, France, Germany; >25% in 19 countries. These describe the traditional market (allowed vocabulary); never call our product insurance.",
    component: MarketSlide,
  },
  {
    id: "path",
    label: "Where we play",
    notes:
      "Developed-market mutual share 32.1% (up from 30.7% in 2014) vs emerging markets 3.0% (down from 4.7%) — the form retreats exactly where it is most needed, because it needed a company to run it. Framing per the locked sequence: Phase 1 is on-chain mutuals (member-funded pools, parametric-first); insurance in the trade's own vocabulary is the 2-3 year vision. Legal posture: the mutual is the lawful form, licensing is a deliberate step, never a dodge.",
    component: PathSlide,
  },
  {
    id: "why-onchain",
    label: "Why on-chain",
    notes:
      "Structural facts, not promises: public solvency (the reserve is a live contract balance); the licensed sector spends 20 to 40 cents of every collected dollar on distribution and admin rather than covered losses (Georgetown CHIR for the informal-sector end); launch is a transaction; payouts and surplus are public facts.",
    component: WhyOnchainSlide,
  },
  {
    id: "prereqs",
    label: "The prerequisites exist",
    notes:
      "De-named on stage: say 'the payment rail' and 'the dispute layer'; the product names stay off stage until the proof moment (the live demo). Status honesty: the rail carries real mainnet flow; the court is devnet with no production dispute volume, audit-gated. The mutual is specified, in implementation, pre-audit.",
    component: PrereqSlide,
  },
  {
    id: "machine",
    label: "The mutual machine",
    notes:
      "Optimistic payouts: a proposer (a trigger, a feed, or an operator) files each payout with evidence; a challenge window opens; unchallenged payouts pay automatically, challenged ones escalate to the mutual's own court. Machine operators may hold juror seats: staked, scored, and slashed like anyone else. Do not imply the mutual stack is deployed; the feedback ask is credible because it is not.",
    component: MachineSlide,
  },
  {
    id: "ladder",
    label: "The adjudication ladder",
    notes:
      "Tier 0 (oracles, prediction markets) is the substrate, not the competitor. First mutuals are chosen for adjudicability, not market size: exploit cover first, microinsurance as the off-chain wedge. Challenge-window parameters (who may challenge, window length, cost of a failed challenge) are per-mutual configuration, not solved constants.",
    component: LadderSlide,
  },
  {
    id: "ask",
    label: "The ask",
    notes:
      "If only one ask lands: the design partner. Feedback and design partners are the current-stage ask; capital follows the audit. Audits are the next step, not done. Close on the brand lockup: Accord, 'Honesty is now a Solana primitive.', useaccord.xyz.",
    component: AskSlide,
  },
];
