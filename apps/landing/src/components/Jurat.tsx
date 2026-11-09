import { useMemo } from "react";
import { CircleSlashIcon, FileTextIcon, GitBranchIcon, TimerIcon } from "lucide-react";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
  IconTile,
  RulingStamp,
  SealedVote,
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

// One jurat duty on the wall-clock loop: scan → read → verdict, then the
// kit's own commit/reveal envelope and the ruling stamp. Same frame
// contract as MechanismStrip; reduced-motion visitors see the settled end.
const LOOP = 360; // frames @ 30fps = 12s
const STAGES = [
  { label: "SCAN", at: 24 },
  { label: "EVIDENCE READ", at: 72 },
  { label: "VERDICT · 87%", at: 120 },
] as const;
const COMMIT_AT = 180;
const REVEAL_AT = 240;
const STAMP_AT = 300;

function DutyStrip() {
  const live = useWallClockFrame({ fps: 30, loopFrames: LOOP });
  const reduced = useMemo(
    () =>
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const frame = reduced ? LOOP - 20 : live;

  return (
    <div
      aria-label="One jurat duty: the daemon scans for a drawn seat, reads the evidence, computes a verdict, commits it sealed, reveals on schedule, and the majority ruling is stamped"
      role="img"
      className="mt-12 flex flex-col items-center gap-9 border-t border-border/60 pt-12"
    >
      <div className="flex flex-wrap justify-center gap-3">
        {STAGES.map((stage) => (
          <span
            key={stage.label}
            className={
              frame >= stage.at
                ? "rounded-md border border-amber/60 bg-raised px-4 py-2 font-mono text-sm text-amber"
                : "rounded-md border border-border bg-raised px-4 py-2 font-mono text-sm text-muted-foreground"
            }
          >
            {stage.label}
          </span>
        ))}
      </div>

      <SealedVote
        frame={frame}
        hash="jurat-01"
        vote="YES"
        commitAt={COMMIT_AT}
        revealAt={REVEAL_AT}
        tone="confirm"
        toneAt={STAMP_AT}
        className="h-auto rounded-md bg-raised px-5 py-2.5 font-mono text-lg"
      />

      <RulingStamp frame={frame} text="RULING: YES" at={STAMP_AT} size="md" />
    </div>
  );
}

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

        <div className="mt-12 max-w-2xl rounded-lg border border-border bg-raised px-6 py-5">
          <p className="font-sans text-xl text-nearwhite">Run one yourself.</p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            One daemon, one hot key. Jurat stakes into Subaccords that pass your filter, watches
            for its seats being drawn, and votes when the evidence is in. Coherent-majority fees
            flow back — that's the mechanism paying for honesty.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <a
              href="https://github.com/xeroc/accord/tree/main/apps/jurat"
              className="text-amber underline-offset-4 transition-colors hover:underline"
              rel="noopener"
            >
              Run a juror →
            </a>
            <a
              href="https://github.com/xeroc/accord/blob/main/apps/docs/adr/accord/0036-jurat-agentic-juror-daemon.md"
              className="text-body underline-offset-4 transition-colors hover:text-nearwhite hover:underline"
              rel="noopener"
            >
              Read the design (ADR-0036)
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
