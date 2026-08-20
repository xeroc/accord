// How it Rules — the chapter catalog. One page per chapter, one film per
// page, each cross-linked to the prose that already exists on
// docs.useaccord.xyz. Source compositions live in apps/remotion/videos/
// (v20260829-*); the films are rendered into public/how-it-rules/.

export interface Chapter {
  /** URL slug under /how-it-rules/ — also the film/poster file stem. */
  slug: string;
  /** Small mono kicker above the title. */
  kicker: string;
  title: string;
  /** One-sentence promise, shown on the hub card and the chapter header. */
  blurb: string;
  /** Film length, display form. */
  duration: string;
  /** What the viewer just watched — 3 beats max, plain English. */
  takeaways: string[];
  /** Deeper prose on docs.useaccord.xyz (path form, no origin). */
  reading: Array<{ href: string; label: string }>;
}

export const CHAPTERS: Chapter[] = [
  {
    slug: "orientation",
    kicker: "The cast of characters",
    title: "What Accord is",
    blurb:
      "The whole system on one map — Subaccords, jurors, vaults, the off-chain peers — and the two CPI calls every integration is built from.",
    duration: "45s",
    takeaways: [
      "A Subaccord is a juror pool with its own collateral, fees, and rules; anyone can create one.",
      "Jurors converge on the honest answer because voting with the majority is the profitable strategy.",
      "Accord never learns what your dispute is about — one call files it, one call reads the ruling.",
    ],
    reading: [
      { href: "/integration/arbitrable-interface/", label: "The Arbitrable interface" },
      { href: "/integration/subaccords/", label: "Subaccords" },
    ],
  },
  {
    slug: "lifecycle",
    kicker: "One case walks the machine",
    title: "The dispute lifecycle",
    blurb:
      "From filing to final ruling along the state machine — and why votes travel in sealed envelopes before they count.",
    duration: "30s",
    takeaways: [
      "A dispute moves Created → Drawn → Review → Commit → Reveal → Ruling, advanced by permissionless crankers.",
      "Commit-reveal seals every vote until all are locked in — nobody can copy the majority.",
      "Appeals loop a resolved round back through a larger panel.",
    ],
    reading: [
      { href: "/reference/state-machine/", label: "The state machine" },
      { href: "/integration/draw-voting/", label: "Draw & voting" },
    ],
  },
  {
    slug: "sortition",
    kicker: "Randomness you can verify",
    title: "The draw",
    blurb:
      "How a panel is drawn: stake-weighted darts over a live Merkle-Sum tree, seeded by an oracle VRF nobody can grind.",
    duration: "46s",
    takeaways: [
      "Draw probability is proportional to stake — literally a dart onto a ruler of everyone's capital.",
      "The juror set lives in an on-chain accumulator root; there is no snapshot to withhold or fake.",
      "The root freezes at the exact moment randomness arrives — manipulation is blind before, inert after.",
    ],
    reading: [
      { href: "/security/sortition-vrf/", label: "Sortition & VRF" },
      { href: "/security/fraud-proofs/", label: "Why the accumulator replaced fraud proofs" },
    ],
  },
  {
    slug: "economics",
    kicker: "Two mints, one verdict",
    title: "The economics",
    blurb:
      "Stake is collateral, fees are pay — and slashing is a ledger entry, not a transfer. Then the appeal ladder that makes bribery exponential.",
    duration: "63s",
    takeaways: [
      "Collateral and compensation are different tokens in different vaults; slashing moves numbers, never coins.",
      "Coherence is judged against the final ruling — a bribed early panel is slashed when it's overturned.",
      "Each appeal seats 2N+1 jurors at exponentially rising bond cost.",
    ],
    reading: [
      { href: "/integration/staking/", label: "Staking" },
      { href: "/integration/appeals/", label: "Appeals" },
    ],
  },
  {
    slug: "evidence",
    kicker: "Sealed, re-keyed, delivered",
    title: "The evidence",
    blurb:
      "The chain holds one hash per round; the bytes stay encrypted and are re-keyed so only the drawn jurors can open them.",
    duration: "30s",
    takeaways: [
      "Only the 32-byte commitment lives on-chain — the package is a manifest Merkle-rooted over every file.",
      "A trusted operator re-encrypts to the drawn panel's keys; the undrawn hold nothing that opens.",
      "Appeals can introduce new evidence — each round's jurors see everything filed so far.",
    ],
    reading: [
      { href: "/integration/disputes/", label: "Filing disputes" },
      { href: "/integration/draw-voting/", label: "Draw & voting" },
    ],
  },
  {
    slug: "robustness",
    kicker: "What is trusted, exactly",
    title: "Failure modes & trust",
    blurb:
      "The capstone: every stall has a priced exit, the pause switch can never pick winners, and the trust map is stated in three colors.",
    duration: "86s",
    takeaways: [
      "Silent oracles, ghosting jurors, dead crankers — every stall ends in a refund, never a locked fund.",
      "Pausing stops new disputes and new stake; adjudication has no valve to close.",
      "Verified on-chain, trusted-but-attributed, one stated assumption — the whole trust surface, mapped.",
    ],
    reading: [
      { href: "/security/trust-profile/", label: "The trust profile" },
      { href: "/security/circuit-breaker/", label: "Circuit breaker" },
    ],
  },
];
