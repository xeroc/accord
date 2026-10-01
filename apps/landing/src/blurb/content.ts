// The blurb page copy. Structure and provenance discipline ported from the
// riprap blurb (../riprap/apps/landing/src/blurb/content.ts): every string
// carries its source in the comment above it. Facts come from this repo:
// README.md, the landing sections (Hero/Mechanism/Heritage/Footer), the
// pitch deck (apps/pitch/src/deck/slides.tsx), and the design tokens
// (packages/ui/src/styles/tokens.css). Integrity law from the landing:
// no traction claims; the status is "live on mainnet, unaudited".

/** Page intro — what this page is and why it is unlisted. */
export const INTRO =
  "Everything on this page is meant to be copied: an explainer when you write about Accord, the logo files, and an email that introduces us to someone you know.";

/** Status line — the build state without traction claims (integrity law,
 * Heritage.tsx: "We don't claim traction"). */
export const STATUS = "live on mainnet · unaudited";

/** One-liner for chats — Footer.tsx line set ("Schelling-point arbitration
 * as a composable Solana primitive") + domain. */
export const ONE_LINE =
  "Accord — Schelling-point arbitration as a composable Solana primitive. useaccord.xyz";

/** Short blurb, ~70 words — the Mechanism.tsx hook ("a primitive — not a
 * product you integrate, a call you make"), the one-sentence mechanism
 * (README), the FinalCTA campaign question, founder. */
export const SHORT_BLURB = `Who's right? On Solana, that question now has a primitive.

Accord is a Schelling-point arbitration oracle: any program files a dispute with two CPI calls, jurors drawn by verifiable stake-weighted sortition vote commit-reveal, and coherence with the majority pays. Honesty is the profitable strategy — no multisig, no hired judges.

Built by Dr.-Ing. Fabian Schuh (full-time crypto since 2014) with Corinna, an AI agent on shift 24/7.

Mechanize the verdict. useaccord.xyz`;

/** Standard blurb, ~170 words — README platform paragraph + Mechanism.tsx
 * lifecycle + Heritage.tsx Kleros lineage + arbitrables + founder. */
export const STANDARD_BLURB = `Dispute resolution is a primitive — not a product you integrate, a call you make.

Accord is a general-purpose, capital-weighted Schelling arbitration oracle on Solana. Any program (the Arbitrable) files a subjective dispute via two CPI calls; Accord draws stake-weighted jurors (VRF over a live on-chain stake accumulator), collects commit-reveal votes, and emits a Ruling governed by game-theoretic incentives instead of a hired-judge committee.

How it works:

 - Any program calls create_dispute(subaccord, options, evidence_hash, fee).
 - Jurors are drawn by verifiable, stake-weighted sortition.
 - Votes are sealed, then revealed — the Schelling point forms independently.
 - Voting coherently with the majority pays; incoherence is slashed.
 - The filer reads the ruling lazily via get_ruling(dispute_id).

The mechanism is proven — Kleros settled 1,000+ disputes on Ethereum. Accord is the same economics packaged as composable Solana infrastructure: the precedent, not the template. Arbitrables already built: Canon (curated-list registry) and Synod (N-party escrow).

Built by Dr.-Ing. Fabian Schuh — full-time crypto since 2014 — with Corinna, an AI agent on shift 24/7.

Live on mainnet, unaudited. useaccord.xyz`;

/** Forwardable email — written in the introducer's voice ("Meet Fabian"),
 * plain text, no links except the blurb page (hash route — GH Pages needs
 * no fallback for it). Rails/why-Fabian facts verbatim from the riprap
 * intro email (bound facts, same founder). */
export const EMAIL_TO = "[investor name]";

export const EMAIL_SUBJECT = "Intro: Accord mechanizes the verdict on Solana.";

export const EMAIL_BODY = `Hi [name],

Meet Fabian. He's building Accord — dispute resolution as a composable Solana primitive.

Any program can file a subjective dispute with two CPI calls: create_dispute() → get_ruling(). Jurors are drawn by verifiable stake-weighted sortition, vote commit-reveal, and honesty is the profitable strategy — no multisig, no hired judges, just aligned incentives.

The mechanism is proven: Kleros settled 1,000+ disputes on Ethereum. Accord packages the same economics as a Solana primitive, and the first Arbitrables are already built — Canon (curated-list registry) and Synod (N-party escrow). Tributary and riprap consume the verdict for recurring payments and mutual risk pools.

Why Fabian: full-time in crypto since 2014. He was the first hire ever paid directly by a blockchain, and he built BitShares' escrow and worker-proposal treasury. He ships with Corinna, an AI agent on shift 24/7.

Live on mainnet, unaudited.

Worth 20 minutes? → https://useaccord.xyz/#/blurb`;

/** The full email as one clipboard string — subject rides along so the
 * introducer can paste it into the compose window's subject field. */
export const EMAIL_FULL = `Subject: ${EMAIL_SUBJECT}\n\n${EMAIL_BODY}`;

/** Team — verbatim from the pitch deck builder slide
 * (apps/pitch/src/deck/slides.tsx STATIC_ROWS / CORINNA_ROWS / PERSONAS). */
export interface Persona {
  img: string;
  alt: string;
  caption: string;
  rows: string[];
}

export const PERSONAS: Persona[] = [
  {
    img: "/people/fabian.webp",
    alt: "Dr.-Ing. Fabian Schuh",
    caption: "Dr.-Ing. Fabian Schuh · xeroc.org",
    rows: [
      "PhD, Engineering",
      "Superteam member",
      "full-time crypto since 2014",
      "fabian@chainsquad.com",
      "x.com/@xer0c · t.me/xeroc",
    ],
  },
  {
    img: "/people/corinna.webp",
    alt: "Corinna — ai agent",
    caption: "Corinna · ai agent",
    rows: ["fact ferret", "the unrelenting", "number cruncher", "devils advocate", "on shift 24/7"],
  },
];

/** Track record — the pitch deck's achievement wall, all 40 lines verbatim
 * (apps/pitch/src/deck/slides.tsx KUDOS). */
export const KUDOS = [
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

/** Brand kit — files served from /brand/ and the site root. The mark's
 * geometry is verbatim from the one AccordMark component
 * (packages/ui/src/brand/accord-mark.tsx — "never redrawn"); the og card
 * is the site's public/og.svg. */
export interface BrandAsset {
  id: string;
  label: string;
  note: string;
  svg: string;
}

export const BRAND_ASSETS: BrandAsset[] = [
  {
    id: "mark",
    label: "the mark",
    note: "Three lines converging on one focal point. One geometry everywhere — app, landing, videos.",
    svg: "/brand/mark.svg",
  },
  {
    id: "mark-on-ink",
    label: "mark on ink",
    note: "The same mark seated on the ink surface — for light contexts that need the field baked in.",
    svg: "/brand/mark-on-ink.svg",
  },
  {
    id: "og",
    label: "the social card",
    note: "The 1200×630 open-graph card: headline, the two calls, the glyph.",
    svg: "/og.svg",
  },
];

/** Contact — same public address as the deck; the build log is the
 * founder's X (the explainers below are from it). */
export const CONTACT_EMAIL = "fabian@chainsquad.com";
export const TELEGRAM_URL = "https://t.me/useaccord";
export const X_FABIAN_URL = "https://x.com/xer0c";

/** Brand story essentials — the name's origin (AGENTS.md: "The name means
 * agreement, harmony — what the Schelling Point produces") and the mark's
 * anatomy (accord-mark.tsx doc). */
export const BRAND_STORY =
  "Accord means agreement, harmony — what the Schelling point produces. The Schelling point here is honesty: jurors vote truthfully because coherent-with-majority is the profitable strategy.";

export const MARK_ANATOMY =
  "The mark is three lines converging on one focal point: many positions, one verdict. One geometry everywhere — app navbar, landing, videos; never redrawn.";

/** Brand usage law — tokens.css header ("ink-dominant, amber identity
 * accent, two restricted state colors") condensed. */
export const BRAND_USAGE =
  "Ink-dominant, one identity accent: Verdict Amber for links, stamps, and the mark — never large fills. Confirm green and slash red are restricted to state. IBM Plex throughout, hairline borders, exponential ease-out motion, always dark.";

/** Brand colors — the working palette, values verbatim from
 * packages/ui/src/styles/tokens.css. The hex strings are data — the
 * palette is the content here, like the baked hex in the SVGs. */
export interface BrandColor {
  name: string;
  note: string;
  hex: string;
}

export interface BrandColorGroup {
  group: string;
  colors: BrandColor[];
}

export const BRAND_COLORS: BrandColorGroup[] = [
  {
    group: "The ink field",
    colors: [
      { name: "Ink", note: "primary surface — cold near-black", hex: "#0a0e14" },
      { name: "Raised", note: "cards, code blocks, popovers", hex: "#11161d" },
      { name: "Border", note: "hairlines, dividers", hex: "#1f2630" },
    ],
  },
  {
    group: "The signal",
    colors: [
      { name: "Verdict Amber", note: "identity accent / primary", hex: "#f0a830" },
      { name: "Confirm", note: "state: success / finalized", hex: "#3fb950" },
      { name: "Slash", note: "state: destructive / slash", hex: "#f85149" },
    ],
  },
  {
    group: "The text",
    colors: [
      { name: "Nearwhite", note: "headlines / foreground on dark", hex: "#f0f6fc" },
      { name: "Body", note: "body text on dark", hex: "#c9d1d9" },
      { name: "Muted", note: "secondary text", hex: "#7d8590" },
      { name: "Paper", note: "rare light surface", hex: "#f6f7f8" },
    ],
  },
];

/** Type — tokens.css font stack; both faces SIL OFL, served via Fontsource
 * from the shared kit. */
export interface BrandType {
  name: string;
  role: string;
}

export const BRAND_TYPE: BrandType[] = [
  { name: "IBM Plex Sans", role: "UI and headlines — the voice" },
  { name: "IBM Plex Mono", role: "code, numbers, stamps — the ledger" },
];

/** The explainers — the Accord posts from the founder's X build log,
 * ordered by what they explain. Tweet bodies, dates, engagement stamps,
 * and permalinks verbatim from the riprap blurb's 2026-09-28 fetch of
 * x.com/xer0c (via the twitterapi MCP); counts drift. The HANSE mutuals
 * post from that set is deliberately omitted — it markets riprap's pool,
 * not Accord. Poster frames and 720p videos are served locally from
 * /blurb/. */
export interface ExplainerTweet {
  /** mono kicker — the ordinal and what this tweet explains */
  kicker: string;
  /** one line on what the reader learns from it */
  note: string;
  /** tweet body, verbatim (media t.co stripped) */
  text: string;
  /** x.com-format date stamp */
  date: string;
  /** engagement stamp beside the date */
  meta: string;
  /** local poster-frame path under /blurb/ (omitted on text-only posts) */
  media?: string;
  /** alt text describing the frame */
  mediaAlt?: string;
  /** local mp4 of the tweet's native video (720p variant) */
  video?: string;
  /** x.com permalink */
  url: string;
  /** companion link when the real content sits in the thread (e.g. YouTube) */
  youtubeUrl?: string;
  /** privacy-enhanced embed of the YouTube talk, when youtubeUrl is set */
  youtubeEmbed?: string;
}

export const EXPLAINERS: ExplainerTweet[] = [
  {
    // x.com/xer0c/status/2092273036791816595 — ACCORD 30s explainer
    kicker: "01 · the verdict layer",
    note: "How a dispute gets decided: Schelling points instead of a multisig or arbitrators.",
    text: "30 seconds on ACCORD.\n\nIt's a dispute resolution system built on Schelling points.\n\nNo Multisig. No arbitrators. Just aligned incentives that nudge everyone toward the obvious fair outcome.\n\nWhat becomes possible? Watch till the end.\n\nExplainer 🎥👇",
    date: "Aug 25, 2026",
    meta: "210 views · 5 likes",
    media: "/blurb/accord-verdict-30s.jpg",
    mediaAlt: "Poster frame of the 30-second ACCORD dispute resolution explainer video",
    video: "/blurb/accord-verdict-30s.mp4",
    url: "https://x.com/xer0c/status/2092273036791816595",
  },
  {
    // x.com/xer0c/status/2092474752799813980 — Schelling court 30s
    // explainer; text verbatim incl. the missing apostrophe in "ACCORDs"
    kicker: "02 · the court",
    note: "The juror mechanics — commit, reveal, majority — and why converging on the fair outcome pays.",
    text: "30 seconds on ACCORDs Schelling Court.\n\nNo Multisig. No lawyers.\n\nJust game theory. Jurors converge on the obvious fair outcome because it's in everyone's interest to tell the truth.\n\nWhat becomes possible? Dispute resolution that's fast, cheap, and composable\n\nWatch the explainer 🎥👇",
    date: "Aug 26, 2026",
    meta: "162 views · 1 like",
    media: "/blurb/schelling-court-30s.jpg",
    mediaAlt: "Poster frame of the 30-second Schelling Court explainer video",
    video: "/blurb/schelling-court-30s.mp4",
    url: "https://x.com/xer0c/status/2092474752799813980",
  },
  {
    // x.com/xer0c/status/2090243673422475386 — rough-cut feedback ask
    kicker: "03 · the rough cut",
    note: "The first 30-second attempt, posted for feedback before the finished cuts existed.",
    text: "What’s the secret to a perfect explainer video? 🧠\n\nToday’s  grind at @mtndao is all about breaking down @Accord. Would love your  feedback on the rough cut. What makes you stop scrolling and actually  watch?",
    date: "Aug 20, 2026",
    meta: "413 views · 3 likes",
    media: "/blurb/explainer-rough-cut.jpg",
    mediaAlt: "Poster frame of the rough-cut explainer video",
    video: "/blurb/explainer-rough-cut.mp4",
    url: "https://x.com/xer0c/status/2090243673422475386",
  },
  {
    // x.com/xer0c/status/2090336880126726271 — day of shooting explainers
    kicker: "04 · the making of",
    note: "A day at mtnDAO turning the rough cut into the finished explainers above.",
    text: "Today at @mtndao: Me making a bunch of explainer videos for ACCORD 🤯\n\nLink to explainers in the comments 👇",
    date: "Aug 20, 2026",
    meta: "215 views · 4 likes",
    media: "/blurb/explainer-making-of.jpg",
    mediaAlt: "Poster frame of the making-of explainer videos post",
    video: "/blurb/explainer-making-of.mp4",
    url: "https://x.com/xer0c/status/2090336880126726271",
  },
  {
    // x.com/xer0c/status/2094103781646712882 — mtnDAO demo day pitch;
    // the full talk is linked in the thread's first comment:
    // youtube.com/watch?v=W816NeczDx8 (resolved 2026-09-28)
    kicker: "05 · the full pitch",
    note: "Accord and mutual risk pools in one demo-day pitch; the full talk is on YouTube.",
    text: "Solana @mtnDAO Demo Day with\n\n💡 Accord and Mutual Risk Pools\n\nDemo day pitch presenting Accord (), a Schelling point based adjudication system on Solana.\n\n✅select jurors from a pool,\n✅have them commit to & reveal a verdict\n✅majority rules\n\nIncentives do the hard work to keep keep jurors in line with the truth. \nThe only outcome of accord: A verdict, to be consumed by another Program.  \n\nA program on top has been built called Hanse: mutual risk pool - the oldest form of pooled protection on earth.\n\nLinks below 👇👇",
    date: "Aug 30, 2026",
    meta: "572 views · 15 likes",
    media: "/blurb/mtndao-demo-day.jpg",
    mediaAlt: "Photo from the mtnDAO demo day pitch in Salt Lake City",
    url: "https://x.com/xer0c/status/2094103781646712882",
    youtubeUrl: "https://www.youtube.com/watch?v=W816NeczDx8",
    youtubeEmbed: "https://www.youtube-nocookie.com/embed/W816NeczDx8",
  },
  {
    // x.com/xer0c/status/2105645963394294010 — mainnet launch thread (the why)
    kicker: "06 · the launch",
    note: "The mainnet launch thread: why Accord exists — disputes between people and agents, settled permissionlessly, p2p.",
    text: "Disputes are at the heart of human 👱interactions, and growingly, also between agents 🤖.\n\nI am using @solana as a tool to solve them, on a global scale, permissionlessly, p2p\n\nbecause I believe people can do more together than apart, without surrendering control.\n\n🧵",
    date: "Oct 1, 2026",
    meta: "8 views · 0 likes",
    url: "https://x.com/xer0c/status/2105645963394294010",
  },
];

/** Explainer band intro — mirrors the riprap band intro, Accord-only. */
export const EXPLAINERS_INTRO =
  "Short cuts and talks from the founder's build log, ordered by what they explain: the verdict layer, the court — how the explainers got made — the full mtnDAO demo-day pitch, and the mainnet launch thread.";
