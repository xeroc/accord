import { useMemo } from "react";
import { CircleSlashIcon, FileTextIcon, GitBranchIcon, TimerIcon } from "lucide-react";
import {
  Button,
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
  IconTile,
  useWallClockFrame,
} from "@useaccord/ui";

// §6 — Jurat: the machine juror. Answers "who are the jurors?" the page
// leaves open — one open-source daemon reads the evidence and votes.
// Copy law: capability claims only, each one traceable to the daemon
// (apps/jurat) — no puffery, no traction claims.

const CAPABILITIES = [
  {
    icon: FileTextIcon,
    title: "Reads every page",
    body: "The whole evidence bundle goes in — contracts, transcripts, logs. Nothing skimmed, nothing skipped at hour nine.",
  },
  {
    icon: TimerIcon,
    title: "Minutes, not weeks",
    body: "The verdict computes the moment evidence lands and commits inside the window. There is no docket.",
  },
  {
    icon: CircleSlashIcon,
    title: "Abstains, never guesses",
    body: "Undecided means a clean abstain plus an alert — never a default vote. A fake signal is worse than silence.",
  },
  {
    icon: GitBranchIcon,
    title: "Open source, dry-run by default",
    body: "One repo, one keypair. Verdicts are computed and reported with the vote gate closed until you arm it.",
  },
] as const;

// One jurat duty as four progress bars: READ → ADJUDICATE → COMMIT →
// REVEAL, each filling for 3s (90 frames @ 30fps) from the hairline
// default to fully amber, then the loop restarts. Reduced-motion
// visitors see all four settled.
const LOOP = 360;
const BEAT = 90;
const DUTIES = ["READ", "ADJUDICATE", "COMMIT", "REVEAL"] as const;

function DutyBox({ label, index, frame }: { label: string; index: number; frame: number }) {
  const t = Math.min(Math.max((frame - index * BEAT) / BEAT, 0), 1);
  const done = t >= 1;
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-raised ${done ? "border-amber" : "border-border"
        }`}
    >
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 bg-amber/15"
        style={{ width: `${t * 100}%` }}
      />
      <p
        className={`relative px-4 py-3 font-mono text-sm ${done ? "text-amber" : "text-muted-foreground"
          }`}
      >
        {label}
      </p>
    </div>
  );
}

function DutyStrip() {
  const live = useWallClockFrame({ fps: 30, loopFrames: LOOP });
  const reduced = useMemo(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  // LOOP itself never occurs in the live loop (frames run 0..359); the
  // reduced-motion branch needs it so the final box reports t = 1.
  const frame = reduced ? LOOP : live;
  return (
    <div
      aria-label="One jurat duty in four three-second beats: read the evidence, adjudicate, commit the sealed vote, reveal on schedule"
      role="img"
      className="pt-12"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {DUTIES.map((duty, i) => (
          <DutyBox key={duty} label={duty} index={i} frame={frame} />
        ))}
      </div>
    </div>
  );
}

const REPO_URL = "https://github.com/xeroc/accord/tree/main/apps/jurat";
const ADR_URL =
  "https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0036-jurat-agentic-juror-daemon.md";

export function Jurat() {
  return (
    <section id="jurat" className="border-t border-border/60 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-amber">
          Jurat · the AI juror operator
        </p>
        <h2 className="mt-4 max-w-3xl font-sans text-3xl font-medium tracking-[-0.01em] text-nearwhite sm:text-4xl">
          Machine jurors, on duty.
        </h2>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-body">
          Accord's jurors don't have to be human. Jurat is the open-source juror operator: point it
          at a Subaccord and an agent takes the seat — reads the decrypted evidence, weighs it
          against the pool's domain doc, and votes.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CAPABILITIES.map((c) => (
            <Frame key={c.title}>
              <FramePanel>
                <FrameHeader>
                  <IconTile variant="soft" aria-hidden="true" className="mb-3">
                    <c.icon />
                  </IconTile>
                  <FrameTitle>{c.title}</FrameTitle>
                  <FrameDescription>{c.body}</FrameDescription>
                </FrameHeader>
              </FramePanel>
            </Frame>
          ))}
        </div>

        <DutyStrip />

        <div className="mt-12 rounded-lg border border-border bg-raised px-6 py-6">
          <p className="font-sans text-xl text-nearwhite">Run one yourself.</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body">
            One daemon, one hot key. Jurat stakes into Subaccords that pass your filter, watches
            for its seats being drawn, and votes when the evidence is in. Coherent-majority fees
            flow back — that's the mechanism paying for honesty.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href={REPO_URL} rel="noopener">
                Run a juror
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={ADR_URL} rel="noopener">
                Read the design (ADR-0036)
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
