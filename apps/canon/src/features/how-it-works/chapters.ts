// How it works — the chapter catalog. One page per chapter, one film per
// page, each cross-linked to the prose that already exists on
// docs.useaccord.xyz. Source compositions live in apps/remotion/videos/
// (v20260820-30s-canon-*); the films are rendered into public/how-it-works/.

export interface Chapter {
  /** URL slug under /how-it-works/ — also the film/poster file stem. */
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
    slug: "intro",
    kicker: "The flagship film",
    title: "What Canon is",
    blurb:
      "A token launches and the fakes arrive in minutes. Canon is the list that defends itself — no key, no gate, just a court.",
    duration: "30s",
    takeaways: [
      "Anyone can submit an item; anyone can challenge it.",
      "A challenge is a case — an Accord court rules on the evidence.",
      "No API key, no gatekeeper: the wallet reads the list directly.",
    ],
    reading: [
      { href: "/integration/arbitrable-interface/", label: "The Arbitrable interface" },
      { href: "/integration/disputes/", label: "Filing disputes" },
    ],
  },
  {
    slug: "list",
    kicker: "Episode 1 · The list",
    title: "The list",
    blurb:
      "Nobody approves a list. One transaction assembles it, the rules compress into an immutable seal, and an Accord court docks onto it.",
    duration: "30s",
    takeaways: [
      "Anyone can forge a canon — that's the point.",
      "Create, court, locked: parameters freeze at creation.",
      "A constitution and a court, owned by no one.",
    ],
    reading: [
      { href: "/integration/arbitrable-interface/", label: "The Arbitrable interface" },
      { href: "/integration/subaccords/", label: "Subaccords" },
    ],
  },
  {
    slug: "item",
    kicker: "Episode 2 · The item",
    title: "The item",
    blurb:
      "Every entry is on trial. One item walks the whole rail — submit, pending, listed, exit — and every state is earned.",
    duration: "30s",
    takeaways: [
      "Listed doesn't mean safe — it means tested.",
      "The state rail is the spine: submit → pending → listed → exit.",
      "Every state is earned.",
    ],
    reading: [
      { href: "/integration/disputes/", label: "Filing disputes" },
      { href: "/reference/state-machine/", label: "The state machine" },
    ],
  },
  {
    slug: "challenge",
    kicker: "Episode 3 · The challenge",
    title: "The challenge",
    blurb:
      "See a scam? Put capital behind it. Stake, case, verdict — a challenge is a case that executes itself.",
    duration: "30s",
    takeaways: [
      "A challenger stakes collateral to open a case.",
      "Jurors weigh the evidence and return a verdict.",
      "The ruling self-executes — nobody enforces it by hand.",
    ],
    reading: [
      { href: "/integration/disputes/", label: "Filing disputes" },
      { href: "/integration/staking/", label: "Staking" },
    ],
  },
  {
    slug: "economics",
    kicker: "Episode 4 · The economics",
    title: "The economics",
    blurb:
      "Lying has a price tag. Every failed attack armors the list; every honest strike collects.",
    duration: "30s",
    takeaways: [
      "Each deposit raises the cost of the next lie (500 → 750 → 1125).",
      "Failed attacks armor the target.",
      "Honest strikes collect; dishonest ones pay.",
    ],
    reading: [
      { href: "/integration/staking/", label: "Staking" },
      { href: "/integration/appeals/", label: "Appeals" },
    ],
  },
];
