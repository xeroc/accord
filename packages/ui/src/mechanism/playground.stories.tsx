import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { JurorPool } from "./juror-pool";
import { SealedVote } from "./sealed-vote";
import { RulingStamp } from "./ruling-stamp";
import { TallyBar } from "./tally";
import { useWallClockFrame } from "./clock";

const meta = {
  title: "Mechanism/Playground",
  parameters: {
    docs: {
      description: {
        component:
          "The whole draw → commit → reveal → rule choreography driven by ONE frame counter — the frame-prop contract every mechanism piece shares. This is the composite the landing page runs as its MechanismStrip and the videos run per beat. For individual components see their siblings in this group (Backdrop, SealedVote, JurorPool, RulingStamp, TallyBar, Chips).",
      },
      source: {
        // Hand-maintained usage excerpt — keep in sync with ScrubDemo below.
        code: `const frame = useWallClockFrame({ fps: 30, loopFrames: 400 });
const BEAT = {
  drawAt: (i) => 24 + i * 6,        // pool dot i pops
  commitAt: (i) => 117 + i * 10,    // juror i seals its hash
  revealAt: (i) => 222 + i * 9,     // juror i flips to its vote
  tallyGrow: 262,
  stampAt: 315,
};
// one drawn pool dot per juror — derive, never hand-count both
const DRAWN_DOTS = JURORS.map((_, i) => 3 + i * 6);

<JurorPool frame={frame} count={30} cols={15}
  drawnAt={(d) => {
    const j = DRAWN_DOTS.indexOf(d);
    return j >= 0 ? BEAT.drawAt(j) : undefined;
  }}
  label="STAKED POOL · 30" />

{JURORS.map((juror, i) => (
  <SealedVote key={juror.hash} frame={frame}
    hash={juror.hash} vote={juror.vote}
    commitAt={BEAT.commitAt(i)} revealAt={BEAT.revealAt(i)}
    tone={juror.vote === "NO" ? "slash" : "confirm"}
    toneAt={300 + i * 4}
    crossAt={juror.vote === "NO" ? 330 : undefined} />
))}`,
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const BEAT = {
  drawAt: (i: number) => 24 + i * 6,
  commitAt: (i: number) => 117 + i * 10,
  revealAt: (i: number) => 222 + i * 9,
  tallyGrow: 262,
  stampAt: 315,
};

/** The cast — five jurors, one incoherent (the NO). One drawn pool dot
 * per sealed vote: DRAWN_DOTS is derived from JURORS, never counted by hand. */
const JURORS = [
  { hash: "6f3a91c2", vote: "YES" },
  { hash: "c07d24ae", vote: "NO" },
  { hash: "9b1e58f0", vote: "YES" },
  { hash: "3d94b761", vote: "YES" },
  { hash: "e2c80b45", vote: "YES" },
] as const;

const DRAWN_DOTS = JURORS.map((_, i) => 3 + i * 6);

const yesCount = JURORS.filter((j) => j.vote === "YES").length;

/** One scrubbed frame driving the whole vocabulary. */
function ScrubDemo() {
  const [manual, setManual] = useState(120);
  const live = useWallClockFrame({ fps: 30, loopFrames: 400 });
  const frame = live + manual;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-8 rounded-lg bg-background p-8">
        <JurorPool
          frame={frame}
          count={30}
          cols={15}
          drawnAt={(d) => {
            const j = DRAWN_DOTS.indexOf(d);
            return j >= 0 ? BEAT.drawAt(j) : undefined;
          }}
          label="STAKED POOL · 30"
        />
        <div className="flex flex-wrap justify-center gap-4">
          {JURORS.map((juror, i) => (
            <SealedVote
              key={juror.hash}
              frame={frame}
              hash={juror.hash}
              vote={juror.vote}
              commitAt={BEAT.commitAt(i)}
              revealAt={BEAT.revealAt(i)}
              tone={juror.vote === "NO" ? "slash" : "confirm"}
              toneAt={300 + i * 4}
              crossAt={juror.vote === "NO" ? 330 : undefined}
            />
          ))}
        </div>
        <TallyBar
          frame={frame}
          yes={yesCount}
          no={JURORS.length - yesCount}
          at={BEAT.tallyGrow}
          width={560}
        />
        <RulingStamp frame={frame} text="RULING: YES" at={BEAT.stampAt} size="md" />
      </div>
      <label className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
        frame offset
        <input
          type="range"
          min={0}
          max={400}
          value={manual}
          onChange={(e) => setManual(Number(e.target.value))}
        />
        {manual}
      </label>
    </div>
  );
}
export const Scrub: Story = { render: () => <ScrubDemo /> };
