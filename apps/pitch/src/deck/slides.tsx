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
 * The pitch deck — Accord-first, the golden circle: WHY (the suit dispute:
 * the chain knows prices, it can't settle an argument) → HOW (collective
 * decision-making: consensus / decision markets / adjudication) → WHAT
 * (Accord: conflict resolution on Solana; juror choreography + economics;
 * the four maxims) → the one application we name, Hanse (prerequisites,
 * PayoutFlow; the field — everyone who tried, tiny; the prize — chain
 * advantages against a $6.2T market) → the builder → links +
 *
 * Staging rules: Accord and Hanse are the only names on stage; Canon/
 * Tributary survive as URLs on the close. No status hedging — conceptual
 * pitch (status lives on the builder roadmap: payments + court live on
 * mainnet, mutuals in development).
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
          Composable on-chain dispute resolution.
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
    <SlideFrame kicker="WHY" headline="The chain knows prices, but it can&rsquo;t settle an argument.">
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
            polymarket, June 2025:
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

/* 03 — HOW: trusted coordination ---------------------------------------------- */

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
      headline="Coordination problems between parties."
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

/* 04 — WHAT: the primitive ----------------------------------------------------- */
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
  "appeals with larger panels",
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

/* 05 — WHAT: the four maxims --------------------------------------------------- */

const MAXIMS = [
  "fully parameterizable, permissionless to use",
  "any staking token, separate fee token",
  "the verdict is the only outcome; enforcement happens elsewhere",
  "one CPI call to integrate",
];

const MaximsSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="DESIGN PHILOSOPHY" headline="Infrastructure. Build on top.">
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

/* 06 — Hanse: mutuals, prerequisites -------------------------------------------- */

const HanseSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame
      kicker="WHAT WE BUILD NEXT — HANSE"
      headline="Mutuals as a protocol."
    >
      <p className="max-w-[60ch] text-2xl leading-snug text-body" style={rise(frame, 22)}>
        Mutuals <span className="underline underline-offset-4 decoration-primary">risk pools</span> are the oldest form of pooled protection on earth;
        its members manage the payouts. (Nexus Mutual, Lloyd's Evertas, etc.).
      </p>
      <div className="flex flex-wrap items-center gap-8 mt-8">
        <PayoutFlow frame={frame} at={50} />
      </div>
    </SlideFrame>
  );
};

/* 07 — Hanse: the field — everyone who tried ---------------------------------- */

/** The competitive set: fees / raise / cover per player, chain in tiny
 * type — every row reads ethereum or off-chain, so the empty Solana
 * column is the argument. Numbers are report-pinned (Nexus '25 report,
 * evertas.com, DeFiLlama); the graveyard stays nameless by staging rule. */
const FIELD_ROWS: {
  name: string;
  chain: string;
  chip?: string;
  chipTone?: "confirm" | "slash" | "neutral";
  cells: { v: string; sub?: string; dead?: boolean }[];
}[] = [
    {
      name: "Nexus Mutual",
      chain: "ethereum · arbitrum · kyc",
      chip: "the only profitable one",
      chipTone: "confirm",
      cells: [
        { v: "$5.7M", sub: "cover fees '25" },
        { v: "$2.7M", sub: "ever · no VC" },
        { v: "$1B+", sub: "purchased '25" },
      ],
    },
    {
      name: "Evertas",
      chain: "lloyd's coverholder · off-chain",
      cells: [
        { v: "—", sub: "undisclosed" },
        { v: "$19.8M", sub: "seed + series A" },
        { v: "$360M", sub: "policy capacity" },
      ],
    },
    {
      name: "nine more, 2020–22",
      chain: "shared idle pools · token-vote claims",
      cells: [{ v: "—" }, { v: "—" }, { v: "dead · dormant", dead: true }],
    },
  ];

const FieldSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="THE FIELD" headline="Everyone who tried.">
      <div className="flex w-full flex-col gap-7 font-mono">
        <div
          className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] gap-x-12 text-sm tracking-[0.2em] text-text-secondary"
          style={rise(frame, 16)}
        >
          <div />
          <div className="text-right">FEES &rsquo;25</div>
          <div className="text-right">RAISED</div>
          <div className="text-right">COVER</div>
        </div>
        {FIELD_ROWS.map((r, i) => (
          <div
            key={r.name}
            className="grid grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] items-baseline gap-x-12 border-t border-white/10 pt-5"
            style={rise(frame, 30 + i * 26)}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-4">
                <span className="font-heading text-3xl font-bold tracking-tight text-nearwhite">
                  {r.name}
                </span>
                {r.chip ? (
                  <MonoChip
                    tone={r.chipTone ?? "neutral"}
                    className="px-3 py-1 text-sm"
                    style={rise(frame, 96 + i * 26)}
                  >
                    {r.chip}
                  </MonoChip>
                ) : null}
              </div>
              <span className="text-sm text-text-secondary">{r.chain}</span>
            </div>
            {r.cells.map((c, j) => (
              <div key={j} className="flex flex-col items-end gap-1 text-right">
                <span
                  className={`text-3xl tabular-nums ${c.dead ? "text-slash" : "text-nearwhite"}`}
                >
                  {c.v}
                </span>
                {c.sub ? (
                  <span className="text-sm text-text-secondary">{c.sub}</span>
                ) : null}
              </div>
            ))}
          </div>
        ))}
        <div className="mt-2 text-xl text-text-secondary" style={rise(frame, 130)}>
          total VC into on-chain cover, ever — all of them:{" "}
          <span className="text-amber">≈$20M</span>
        </div>
      </div>
    </SlideFrame>
  );
};

/* 08 — Hanse: the prize -------------------------------------------------------- */

/** The zoom-out: the whole on-chain sector vs the business it copies.
 * TVL is a point-in-time stock — never USD/yr; the flows are ICMIF '24. */
const MARKET_ROWS: { label: string; to: number; at: number }[] = [
  { label: "on-chain cover sector TVL (DeFiLlama)", to: 104_000_000, at: 30 },
  { label: "mutual cover written (ICMIF '24, USD/yr)", to: 1_606_000_000_000, at: 60 },
  { label: "global insurance market (ICMIF '24, USD/yr)", to: 6_163_000_000_000, at: 90 },
];

/** What running on a blockchain gives insurance — the advantages block. */
const CHAIN_PROS: string[] = [
  "permissionless to launch",
  "programmable & composable",
  "globally accessible",
  "micro-insurances at scale",
  "new products become feasable",
];

const HansePrizeSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <SlideFrame kicker="THE PRIZE" headline="On-chain cover barely exists.">
      <div className="flex w-full flex-1 items-center gap-16">
        {/* left — what the chain gives */}
        <div className="flex flex-1 flex-col gap-5 font-mono">
          <div className="text-lg tracking-[0.25em] text-primary" style={rise(frame, 120)}>
            On the chain, insurance is
          </div>
          {CHAIN_PROS.map((r, i) => (
            <div key={r} className="font-mono text-2xl text-body" style={rise(frame, 130 + i * 12)}>
              <span className="text-success">✔</span> {r}
            </div>
          ))}
          <div
            className="mt-6 max-w-2xl rounded-xl px-8 pt-6 text-xl font-extrabold leading-snug text-body"
            style={rise(frame, 200)}
          >
            Blockchains excel at capital pooling, autonomous execution, transparency, and audit-proof accounting.
          </div>
          <div
            className="mt-6 max-w-2xl rounded-xl px-8 pt-4 text-xl font-extrabold leading-snug text-primary"
            style={rise(frame, 200)}
          >
            And we use that for memecoins?
          </div>
        </div>
        {/* right — the market */}
        <div className="flex flex-1 flex-col items-end gap-6 font-mono">
          <div className="text-lg tracking-[0.25em] text-confirm" style={rise(frame, 30)}>
            THE MARKET
          </div>
          {MARKET_ROWS.map((r) => (
            <LedgerCounter
              key={r.label}
              frame={frame}
              label={r.label}
              from={0}
              to={r.to}
              at={r.at}
              dur={34}
              tone="confirm"
              layout="stacked"
              className="text-2xl"
            />
          ))}
        </div>
      </div>
    </SlideFrame>
  );
};

/* 09 — the builder ------------------------------------------------------------- */

const STATIC_ROWS = [
  "PhD, Engineering",
  "Superteam member",
  "full-time crypto since 2014",
  "fabian@chainsquad.com",
  "x.com/@xer0c · t.me/xeroc"
];

const CORINNA_ROWS = [
  "AI agent",
  "market research",
  "social media",
  "analytics",
  "on shift 24/7",
];

/** The two builder columns — the human and the AI teammate, side by
 * side: smaller portraits, bullets beneath each. */
const PERSONAS: { img: string; alt: string; caption: string; rows: string[] }[] = [
  {
    img: "fabian.webp",
    alt: "Dr.-Ing. Fabian Schuh",
    caption: "Dr.-Ing. Fabian Schuh · xeroc.org",
    rows: STATIC_ROWS,
  },
  {
    img: "corinna.webp",
    alt: "Corinna — AI agent",
    caption: "Corinna · AI agent",
    rows: CORINNA_ROWS,
  },
];

/** The achievement wall — ambience, not a reading list. Four copies make
 * the marquee seamless; the audience catches fragments, that's the point. */
const KUDOS = [
  "Accord — on-chain arbitration",
  "2× Gold · Colosseum Frontier 2026",
  "Tributary — Solana payment rail",
  "Solana Foundation grant · 2026",
  "Canon — curated-list registry",
  "500M+ blocks produced",
  "Synod — N-party escrow",
  "first hire by a blockchain, ever",
  "mash.fun — prediction markets · CTO",
  "Agentic Engineering Grant · 2026",
  "repo.trade — launchpad for repos",
  "board · Blockchain BV",
  "Solana Security #2 graduate",
  "Trezor hackathon · 2nd place",
  "python-bitshares — full L1 SDK",
  "Cypherpunk · $10k · 2025",
  "soltrace — Solana indexer",
  "graphenelib — SDK for a chain family",
  "Superteam Germany grant · 2024",
  "Lucky Swaps — leveraged swaps",
  "Advisor to MakerDAO",
  "contribute.so — creator funding",
  "board · BitShares Foundation (BBF)",
  "chaoscraft — 1,000 minds, 1 codebase",
  "exbet.io — on-chain sports exchange",
  "RADAR · honorable mention · 2024",
  "CTO · Blockchain Projects BV",
  "allowly — pocket money for agents",
  "CTO · BlockOps GmbH",
  "board · PeerPlays Standards (PBSA)",
  "polycode — multi-agent automation",
  "CTO · Flux Capa NV",
  "Trezor signing for Graphene",
  "board · Kliq",
  "CTO · DacTales BV",
  "lando — agents that invoice",
  "committee seats: Steem/Hive/BTS",
  "CTO · Blockchain BV",
  "board · Coincrete",
  "python-steem · python-peerplays",
];

const BuilderSlide: FC = () => {
  const frame = useSlideFrame();
  return (
    <div className="relative h-full w-full">
      <div className="flex h-full flex-col justify-center gap-10 pl-[7vw] pr-[30vw]">
        <div className="flex flex-col gap-6">
          <div className="font-mono text-xl tracking-[0.3em] text-amber">THE BUILDERS</div>
          <h2 className="max-w-[22ch] font-heading text-6xl font-bold leading-[1.05] tracking-tight text-nearwhite">
            Who&rsquo;s building it.
          </h2>
        </div>
        <div className="flex items-start gap-20">
          {PERSONAS.map((p, pi) => (
            <figure key={p.img} className="flex flex-col gap-4" style={rise(frame, 24 + pi * 70)}>
              <img
                src={p.img}
                alt={p.alt}
                className="h-[30vh] rounded-lg border border-white/10 object-cover shadow-2xl"
              />
              <figcaption className="font-mono text-sm text-text-secondary">
                {p.caption}
              </figcaption>
              <div className="flex flex-col gap-2.5 pt-1">
                {p.rows.map((r, i) => (
                  <div
                    key={r}
                    className="font-mono text-lg text-body"
                    style={rise(frame, 56 + pi * 70 + i * 8)}
                  >
                    <span className="text-primary">▶</span> {r}
                  </div>
                ))}
              </div>
            </figure>
          ))}
        </div>
      </div>
      <div
        className="absolute inset-y-0 right-0 flex w-[50ch] items-center overflow-hidden font-mono"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
        }}
      >
        <div className="kudos-track flex w-full flex-col">
          {[0, 1, 2, 3].flatMap((copy) =>
            KUDOS.map((k, i) => (
              <div
                key={`${copy}-${i}`}
                className="w-full whitespace-nowrap py-2 pr-4 text-right text-lg leading-relaxed text-text-secondary"
              >
                {k}
              </div>
            )),
          )}
        </div>
      </div>
    </div>
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
        Adjudication as a primitive.
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
      "10s. Accord — composable on-chain arbitration. Status lives on the builder slide's roadmap: pull payments and dispute resolution live on mainnet, mutuals (Hanse) in development. Audits in flight.",
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
      "25s. Rapid-fire, one breath each: fully parameterizable, permissionless to use. Any staking token; a separate fee token. The verdict is the only outcome. Enforcement happens elsewhere, with whoever called us. One CPI call to integrate. Accord is infra, built to be called by other programs, not visited.",
    component: MaximsSlide,
  },
  {
    id: "hanse",
    label: "Hanse — 1+1=3",
    notes:
      "35s. The one application we name: Hanse — mutuals as a protocol. A mutual pools risk and capital; its members manage payouts. Two prerequisites: recurring contributions (pull payments — built) and dispute resolution for claims paying from the pool (Accord — built). Put one and one together and you get three. Do not mention other applications here — generality already lives in the maxims; this deck has one story.",
    component: HanseSlide,
  },
  {
    id: "field",
    label: "Hanse — the field",
    notes:
      "25s. The whole sector in one table. Nexus Mutual — the only profitable protocol in the sector's history: $5.7M cover fees in '25, $1B+ cover purchased, raised $2.7M total, ever, no VC (Nexus '25 report; CoinDesk). Ethereum + Arbitrum, KYC-gated, one mutual — and in 2025 it moved claims from member vote to a permissioned expert committee (NMPIP-261); that recentralization is our whole thesis. Evertas: $19.8M raised, Lloyd's coverholder, $360M per-policy capacity — traditional paper with crypto underwriting, not a protocol. Nine more launched 2020–22 — one pivoted to audits (Sherlock), the rest dead or dormant: shared idle-capital pools death-spiraled, token-vote claims collapsed. Both failure modes are structurally fixed here (one risk per pool, staked jury) — that is the Q&A answer to 'why has nobody built this?'. Sector lifetime VC ≈$20M. If pressed on Nexus profitability: $14.3M net cash flow '25, but float-driven (investment income + RAMM), not underwriting. Drift, spoken only if it fits: $285M hack on Solana, Apr 2026 — largest DeFi hack ever, nobody paid out.",
    component: FieldSlide,
  },
  {
    id: "hanse-prize",
    label: "Hanse — the prize",
    notes:
      "35s. Numbers first: the entire on-chain cover sector holds ~$104M TVL (DeFiLlama — a point-in-time stock, never say USD/yr). Mutuals write $1.61T of cover a year, ~26% of all insurance (ICMIF '24). Global insurance: $6.16T a year. On-chain cover rounds to zero against the business it copies. Then the advantages: permissionless to launch, programmable & composable, globally accessible, micro-premiums at scale, products impossible off-chain. Land the punch with feeling: blockchains are machines for pooling capital and keeping honest books — a mutual is exactly that; the hard part, the verdict on claims, is built — why the fuck are we doing memecoins? Q&A only: Anthea $22M Series A 2026 (the sector is re-fundable); Nexus non-EVM listings announced for Q1 2026 — the Solana-native window is 2–4 quarters.",
    component: HansePrizeSlide,
  },
  {
    id: "builder",
    label: "The builder",
    notes:
      "20s. Who builds this — two columns, one slide. Left: Dr.-Ing. Fabian Schuh — PhD in engineering, Superteam DE, full-time crypto since 2014, fabian@chainsquad.com. Right: Corinna — an AI agent on the team: business development, social media, analytics, on shift 24/7. Line: 'the team is bigger than one — Corinna runs BD, social and analytics; she doesn't sleep.' Roadmap is off-slide for now — status is spoken if asked: pull payments live on mainnet, dispute resolution on devnet, mutuals in development. The scrolling wall on the right is ambience — grants, hackathon golds, the project family (Tributary, mash.fun, repo.trade, Canon, Synod, …). Don't read it; gesture once ('twenty years of shipping, on-chain since 2014 — the wall keeps scrolling'). Not my first governance system.",
    component: BuilderSlide,
  },
  {
    id: "close",
    label: "Mechanize the verdict",
    notes:
      "10s. The deployed surfaces — go try them: app.useaccord.xyz (the court), canon.useaccord.xyz (a curated list running on Accord), hanse.useaccord.xyz (mutuals). Hold on the tagline: Mechanize the verdict. No ask on stage — conversations after.",
    component: CloseSlide,
  },
];
