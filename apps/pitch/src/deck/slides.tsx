import type { FC } from "react";

import {
  AccordMark,
  AmberRule,
  JurorPool,
  LedgerCounter,
  MonoChip,
  TallyBar,
  RulingStamp,
  SealedVote,
  Wordmark,
  PayoutFlow
} from "@useaccord/ui";

import { SlideFrame } from "./shell";
import { useSlideFrame } from "./useSlideFrame";

/**
 * The pitch deck — Accord-first, the golden circle (grilled outline,
 * 2026-08-25): WHY (the suit dispute → the disconnect) → HOW (trusted
 * coordination between parties that don't trust each other) → WHAT (Accord:
 * conflict resolution on Solana — the flywheel, the four maxims) → the one
 * application we name, Hanse (1+1=3, status quo vs $1.61T) → links +
 * "Mechanize the verdict."
 *
 * Staging rules: Accord and Hanse are the only names on stage; Canon/
 * Tributary survive as URLs on the close. No status hedging — conceptual
 * pitch (Q&A answer: devnet today, mainnet when we pull the trigger).
 * Numbers carry citations; every mechanism visual is a ui-kit piece
 * driven by the slide-local frame clock.
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
        <Wordmark enter={Math.min(1, Math.max(0, (frame - 18) / 30))} className="text-8xl" brandName="Accord" />
        <div className="font-heading text-4xl font-bold tracking-tight text-nearwhite">
          Composable on-chain dispute resolution
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

/* 02 — WHY: the suit --------------------------------------------------------- */

const SuitSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="WHY" headline="The chain knows prices but it can&rsquo;t settle an argument.">
      <div className="flex items-center gap-14">
        <figure className="flex flex-col gap-3" style={rise(frame, 24)}>
          <img
            src="suit.jpg"
            alt="President Zelenskyy at the NATO summit, June 2025"
            className="h-[44vh] rounded-lg border border-white/10 object-cover shadow-2xl"
          />
          <figcaption className="font-mono text-sm text-text-secondary">
            NATO summit, The Hague — June 25, 2025
          </figcaption>
        </figure>
        <div className="flex flex-col gap-6">
          <div className="font-mono text-xl text-text-secondary" style={rise(frame, 40)}>
            polymarket, june 2025:
          </div>
          <div className="font-heading text-3xl font-bold leading-tight text-nearwhite" style={rise(frame, 52)}>
            &ldquo;Will Zelenskyy wear a suit before July?&rdquo;
          </div>
          <div className="flex flex-wrap gap-3" style={rise(frame, 104)}>
            <MonoChip tone="confirm" className="px-4 py-2 text-lg">
              the designer: it&rsquo;s a suit
            </MonoChip>
            <MonoChip tone="confirm" className="px-4 py-2 text-lg">
              menswear experts: it&rsquo;s a suit
            </MonoChip>
          </div>
          <div style={rise(frame, 124)} className="mt-12 ml-12">
            <RulingStamp frame={frame} text="NOT A SUIT" at={132} />
          </div>
        </div>
      </div>
    </SlideFrame>
  );
};

/* 04 — HOW: trusted coordination ---------------------------------------------- */

const RUNGS = [
  "Consensus handles agreement under adversarial conditions.",
  "Decision markets handle uncertainty.",
  "Adjudication handles ambiguity.",
];

const HowSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame
      kicker="HOW"
      headline="Coordination problems between parties"
    >
      <div className="text-lg tracking-[0.25em] text-confirm" style={rise(frame, 30)}>
        Collective decision-making mechanisms
      </div>
      <div className="flex max-w-5xl flex-col gap-7">
        {RUNGS.map((r, i) => (
          <div key={r} className="flex items-baseline gap-6" style={rise(frame, 24 + i * 18)}>
            <span className="font-mono text-xl text-amber">0{i + 1}</span>
            <span
              className={`font-heading text-4xl font-bold tracking-tight ${i === RUNGS.length - 1 ? "text-amber" : "text-nearwhite"
                }`}
            >
              {r}
            </span>
          </div>
        ))}
      </div>
    </SlideFrame>
  );
};

/* 05 — WHAT: the primitive ----------------------------------------------------- */
const PLAYGROUND_BEAT = {
  drawAt: (i: number) => 24 + i * 6,
  commitAt: (i: number) => 117 + i * 10,
  revealAt: (i: number) => 222 + i * 9,
  tallyGrow: 262,
  stampAt: 315,
};

const PLAYGROUND_JURORS = [
  { hash: "6f3a91c2", vote: "YES" },
  { hash: "c07d24ae", vote: "NO" },
  { hash: "9b1e58f0", vote: "YES" },
  { hash: "3d94b761", vote: "YES" },
  { hash: "e2c80b45", vote: "YES" },
] as const;
const WHEEL = [
  "jurors stake skin in the game",
  "stake-weighted random draw (VRF)",
  "votes sealed, then revealed",
  "incoherent jurors are slashed",
  "coherent jurors are rewarded",
];

const PLAYGROUND_DOTS = PLAYGROUND_JURORS.map((_, i) => 3 + i * 6);

const WhatSlide: FC = () => {
  const frame = useSlideFrame();
  const yesCount = PLAYGROUND_JURORS.filter((j) => j.vote === "YES").length;
  return (
    <SlideFrame kicker="WHAT" headline="Accord is conflict resolution on Solana.">
      <div className="flex flex-col items-center gap-8 rounded-lg p-8">
        <JurorPool
          frame={frame}
          count={30}
          cols={15}
          drawnAt={(d) => {
            const j = PLAYGROUND_DOTS.indexOf(d);
            return j >= 0 ? PLAYGROUND_BEAT.drawAt(j) : undefined;
          }}
          label="STAKED POOL · 30"
        />
        <div className="flex flex-wrap justify-center gap-4">
          {PLAYGROUND_JURORS.map((juror, i) => (
            <SealedVote
              key={juror.hash}
              frame={frame}
              hash={juror.hash}
              vote={juror.vote}
              commitAt={PLAYGROUND_BEAT.commitAt(i)}
              revealAt={PLAYGROUND_BEAT.revealAt(i)}
              tone={juror.vote === "NO" ? "slash" : "confirm"}
              toneAt={300 + i * 4}
              crossAt={juror.vote === "NO" ? 330 : undefined}
            />
          ))}
        </div>
        <TallyBar
          frame={frame}
          yes={yesCount}
          no={PLAYGROUND_JURORS.length - yesCount}
          at={PLAYGROUND_BEAT.tallyGrow}
          width={560}
        />
        <RulingStamp frame={frame} text="RULING: YES" at={PLAYGROUND_BEAT.stampAt} size="md" />
      </div>

      <div className="flex max-w-6xl flex-wrap gap-2">
        {WHEEL.map((w, i) => (
          <MonoChip key={w} tone="neutral" className="px-5 py-2.5 text-sm" style={rise(frame, PLAYGROUND_BEAT.stampAt + i * 12)}>
            {w}
          </MonoChip>
        ))}
      </div>
    </SlideFrame>
  );
};

/* 07 — WHAT: the four maxims --------------------------------------------------- */

const MAXIMS = [
  "fully parameterizable, permissionless to use",
  "any staking token, separate fee token",
  "the verdict is the only outcome, enforcement happens elsewhere",
  "one CPI call to integrate",
];

const MaximsSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="DESIGN PHILOSOPHY" headline="Infrastructure. Build on top">
      <div className="flex max-w-7xl flex-col gap-7">
        {MAXIMS.map((m, i) => (
          <div key={m} className="flex items-baseline gap-6" style={rise(frame, 24 + i * 18)}>
            <span className="font-mono text-xl text-amber">0{i + 1}</span>
            <span className="font-heading text-4xl font-bold tracking-tight text-nearwhite">
              {m}
            </span>
          </div>
        ))}
      </div>
    </SlideFrame>
  );
};

/* 08 — Hanse: mutuals, 1+1=3 ---------------------------------------------------- */

const HanseSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame
      kicker="WHAT WE BUILD NEXT — HANSE"
      headline="Mutuals as a protocol."
    >
      <p className="max-w-[60ch] text-2xl leading-snug text-body" style={rise(frame, 22)}>
        A mutual pools risk and capital; its members manage the payouts. Two
        prerequisites. We built both: <span className="text-primary">pull payments</span>, <span className="text-primary">dispute resolution</span>
      </p>
      <div className="flex flex-wrap items-center gap-8 mt-8">
        <PayoutFlow frame={frame} at={50} />
      </div>
    </SlideFrame>
  );
};

/* 09 — Hanse: status quo and future --------------------------------------------- */

const REAL_ROWS: { label: string; to: number; at: number }[] = [
  { label: "global insurance market (ICMIF'24, USD/yr)", to: 6_163_000_000_000, at: 40 },
  { label: "mutual cover written worldwide (ICMIF'24, USD/yr)", to: 1_606_000_000_000, at: 80 },
  { label: "on-chain cover sector TVL (DeFiLlama, USD/yr)", to: 104_000_000, at: 96 },
  { label: "of that TVL in one web3 player (%)", to: 84, at: 114 },
];

const HanseFutureSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame
      kicker="STATUS QUO"
      headline="On-chain cover barely exists."
    >
      <div className="flex min-w-8xl flex-col gap-3 font-mono">
        <div className="text-lg tracking-[0.25em] text-confirm" style={rise(frame, 30)}>
          ANNUAL COVER WRITTEN
        </div>
        {REAL_ROWS.map((r) => (
          <LedgerCounter
            key={r.label}
            frame={frame}
            label={r.label}
            from={0}
            to={r.to}
            at={r.at}
            dur={34}
            tone="confirm"
            className="text-2xl"
          />
        ))}
      </div>
      <div className="flex justify-center w-full">
        <div
          className="text-3xl font-extrabold leading-snug text-primary border-2 border-primary rounded-xl px-8 py-6 text-center max-w-2xl"
          style={rise(frame, 0)}
        >
          Building Mutuals on Solana first. <br />
          On-chain Insurances in 12 months.
        </div>
      </div>
    </SlideFrame>
  );
};

/* 10 — close: the deployed apps + the tagline ----------------------------------- */

const LINKS = [
  { url: "app.useaccord.xyz", note: "the court" },
  { url: "canon.useaccord.xyz", note: "curated list" },
  { url: "hanse.useaccord.xyz", note: "mutuals" },
];

const CloseSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-12 px-[7vw] text-center">
      <div className="flex flex-col items-center gap-5" style={rise(frame, 0)}>
        <Wordmark
          enter={Math.min(1, Math.max(0, frame / 24))}
          settle={24}
          className="text-6xl"
          brandName="Accord"
        />
        <AmberRule enter={Math.min(1, Math.max(0, (frame - 20) / 24))} className="h-1.5 w-56" />
      </div>
      <div data-rise className="flex flex-wrap justify-center gap-12">
        {LINKS.map((l, i) => (
          <span key={l.url} className="flex flex-col items-center gap-1" style={rise(frame, 40 + i * 16)}>
            <span className="font-mono text-2xl text-nearwhite">{l.url}</span>
            <span className="font-mono text-lg text-text-secondary">{l.note}</span>
          </span>
        ))}
      </div>
      <div
        className="font-heading text-7xl font-bold tracking-tight text-nearwhite"
        style={rise(frame, 104)}
      >
        Mechanize the verdict.
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
    label: "Accord",
    notes:
      "10s. Accord — composable on-chain arbitration. No status chips anywhere in this deck: we present conceptually. Q&A answer if asked: devnet today, mainnet when we pull the trigger, audits in flight.",
    component: TitleSlide,
  },
  {
    id: "suit",
    label: "WHY — the suit",
    notes:
      "45s. 'The real world runs on disputes.' Then the photo. Deadpan: 'In June, Polymarket ran a market: will Zelenskyy wear a suit before July. He showed up at NATO in this. The designer says it's a suit. Menswear experts say it's a suit. How the fuck is the blockchain supposed to know if that's a suit?' $160M rode on the answer — and UMA token holders voted, by a large margin: not a suit. Facts (verified 2026-08-25): market window May 22–Jun 30 2025; garment appeared Jun 24, NATO summit The Hague; designer + Derek Guy endorsements; $160M (CoinDesk Jul 7 2025, via Forbes); UMA DVM stake-weighted vote ruled NO after multiple dispute rounds, with whale-manipulation allegations. Point: the facts were public — the ambiguity was in the meaning. Delivery: no political commentary, the joke is about definitions.",
    component: SuitSlide,
  },
  {
    id: "how",
    label: "HOW — coordination",
    notes:
      "45s. The evolution of on-chain trust machinery, read as three rungs. Consensus solved coordination under adversarial conditions — the Byzantine generals problem, block production. Markets resolve uncertainty — prices aggregate probability. Adjudication resolves ambiguity — what actually happened, what should happen next — and that rung does not exist yet. The ladder pre-answers 'why not just an oracle or a market?': the suit already showed a market choking on ambiguity. Do not name Accord on this slide; the next one lands it. Delivery: read the three lines slowly, let the parallelism do the work.",
    component: HowSlide,
  },
  {
    id: "what",
    label: "WHAT — the primitive",
    notes:
      "15s. Accord is conflict resolution on Solana. Narrate the choreography as it plays: a pool of thirty staked jurors, five drawn at random, votes sealed then revealed — the one NO voted against the evident majority and pays for it — tally, ruling. Keep it brisk — this is the hinge from story to machine.",
    component: WhatSlide,
  },
  {
    id: "maxims",
    label: "Design philosophy",
    notes:
      "25s. Rapid-fire, one breath each: fully parameterizable, permissionless to use. No token of its own — pure infrastructure. The verdict is the only outcome. Enforcement happens elsewhere, with whoever called us. One CPI call to integrate. Accord is infra, built to be called by other programs, not visited.",
    component: MaximsSlide,
  },
  {
    id: "hanse",
    label: "Hanse — 1+1=3",
    notes:
      "35s. The one application we name: Hanse — mutuals as a protocol. A mutual pools risk and capital; its members manage payouts. It needs exactly two machines: recurring contributions (pull payments — built) and dispute resolution for claims paying from the pool (Accord — built). Put one and one together and you get three. Do not mention other applications here — generality already lives in the maxims; this deck has one story.",
    component: HanseSlide,
  },
  {
    id: "hanse-future",
    label: "Status quo → future",
    notes:
      "40s. Numbers only, no incumbent drama: the entire on-chain cover sector is ~$104M TVL with 84% in one player (DeFiLlama, Aug 2026). The real world: $1.61T of mutual cover written per year, 26% of the world's cover, 4,700+ societies in 80 countries (ICMIF 2026, 2024 data). The on-chain version barely exists. And from mutuals to insurance — a small step. If asked about Nexus: it does have claims adjudication — member assessment, moved to a permissioned expert committee in v3; that recentralization is our whole thesis.",
    component: HanseFutureSlide,
  },
  {
    id: "close",
    label: "Mechanize the verdict",
    notes:
      "10s. The deployed surfaces — go try them: app.useaccord.xyz (the court), canon.useaccord.xyz (a curated list running on Accord), hanse.useaccord.xyz (mutuals). Hold on the tagline: Mechanize the verdict. No ask on stage — conversations after.",
    component: CloseSlide,
  },
];
