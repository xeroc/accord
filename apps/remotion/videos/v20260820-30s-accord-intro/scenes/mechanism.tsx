import { Badge, Card, CardContent, CardHeader, CardTitle } from "@useaccord/ui";
import {
  Interactive,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { FC, ReactNode } from "react";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";
import { enterAt } from "./anim";

/** Beat lengths sum to 330 (11s @ 30fps). */
const BEATS = [
  { key: "file", frames: 83, label: "01 · file" },
  { key: "draw", frames: 83, label: "02 · draw" },
  { key: "vote", frames: 82, label: "03 · vote" },
  { key: "rule", frames: 82, label: "04 · rule" },
] as const;

/**
 * Shared beat chrome: visual center, copy bottom. The step label lives in
 * the progress rail up top — one label per step, not two.
 */
const Beat: FC<{
  copy: string;
  sub: string;
  copyClass?: string;
  children: ReactNode;
}> = ({ copy, sub, copyClass, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-12 p-16">
      <div className="flex h-[380px] items-center justify-center">
        {children}
      </div>
      <div className="flex flex-col items-center gap-4">
        <h2
          className={`font-heading font-bold text-nearwhite ${copyClass ?? "text-5xl"}`}
          style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
        >
          {copy}
        </h2>
        <p
          className="font-mono text-2xl text-text-secondary"
          style={{ opacity: enterAt(frame, fps, 0.25, 0.4) }}
        >
          {sub}
        </p>
      </div>
    </div>
  );
};

/** 01 · file — the dispute dossier slides in; anyone can file it. */
const FileBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Beat copy="anyone files a dispute" sub="create_dispute()">
      <div className="flex flex-col items-center gap-8">
        <Interactive.Div
          name="Dispute dossier"
          className="w-[560px]"
          style={{
            opacity: enterAt(frame, fps, 0.1, 0.6),
            translate: interpolate(
              frame,
              [0.1 * fps, 0.7 * fps],
              ["-180px 0px", "0px 0px"],
              {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                dispute #001
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 font-mono text-2xl">
              <div className="flex justify-between">
                <span className="text-text-secondary">option a</span>
                <span className="text-nearwhite">milestone shipped</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">option b</span>
                <span className="text-nearwhite">not shipped</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">fee</span>
                <span className="text-nearwhite">5 USDC</span>
              </div>
            </CardContent>
          </Card>
        </Interactive.Div>
        <Interactive.Div
          name="File chip"
          className="rounded-md border border-border-subtle px-4 py-2 font-mono text-2xl text-amber"
          style={{ opacity: enterAt(frame, fps, 1.4, 0.4) }}
        >
          create_dispute()
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** Leaf widths encode stake weight; drawn jurors light amber. */
const LEAF_WEIGHTS = [64, 120, 84, 150, 70, 104, 60, 92];
const DRAWN = [1, 3, 6];

/** 02 · draw — stake-weighted sortition from the accumulator. */
const DrawBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Beat copy="random jurors, weighted by stake" sub="vrf · stake accumulator">
      <div className="flex flex-col items-end gap-8">
        <Interactive.Div
          name="Stake accumulator row"
          className="flex h-20 items-end gap-2"
          style={{
            opacity: enterAt(frame, fps, 0.1, 0.5),
            translate: interpolate(
              frame,
              [0.1 * fps, 0.6 * fps],
              ["0px 30px", "0px 0px"],
              {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          }}
        >
          {LEAF_WEIGHTS.map((w, i) => {
            const lit = enterAt(frame, fps, 0.8 + DRAWN.indexOf(i) * 0.35, 0.3);
            const drawn = DRAWN.includes(i);
            return (
              <div
                key={i}
                className={`h-full rounded-md border ${
                  drawn
                    ? "border-amber bg-amber"
                    : "border-border-subtle bg-raised"
                }`}
                style={{ width: w, opacity: drawn ? 0.25 + 0.75 * lit : 1 }}
              />
            );
          })}
        </Interactive.Div>
        <Badge
          variant="secondary"
          style={{ opacity: enterAt(frame, fps, 2.0, 0.4) }}
        >
          3 jurors drawn
        </Badge>
      </div>
    </Beat>
  );
};

const JUROR_VOTES = ["a", "a", "b"] as const;

/** 03 · vote — sealed commits, then the reveal flips them open. */
const VoteBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = enterAt(frame, fps, 0.1, 0.5);
  const flips = JUROR_VOTES.map((_, i) =>
    enterAt(frame, fps, 0.9 + i * 0.3, 0.45),
  );
  return (
    <Beat copy="secret votes, then revealed" sub="commit → reveal">
      <div
        className="flex items-center gap-8"
        style={{
          opacity: enter,
          scale: `${0.94 + 0.06 * enter} ${0.94 + 0.06 * enter}`,
        }}
      >
        {JUROR_VOTES.map((vote, i) => (
          <div key={i} style={{ perspective: 1000 }}>
            <div
              className="relative h-[180px] w-[280px]"
              style={{
                transformStyle: "preserve-3d",
                transform: `rotateY(${(flips[i] ?? 0) * 180}deg)`,
              }}
            >
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-border-subtle bg-raised"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="font-mono text-xl text-text-secondary">
                  hash(vote, salt)
                </span>
                <Badge variant="secondary">sealed</Badge>
              </div>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-amber bg-raised"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <span className="font-mono text-xl text-text-secondary">
                  {"{vote, salt}"}
                </span>
                <Badge variant="secondary">vote · {vote}</Badge>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Beat>
  );
};

/** 04 · rule — the tally tips to the majority. */
const RuleBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = [0, 1, 2].map((i) => enterAt(frame, fps, 0.3 + i * 0.25, 0.4));
  const winner = enterAt(frame, fps, 1.6, 0.4);
  return (
    <Beat copy="majority wins." sub="get_ruling()" copyClass="text-6xl">
      <div className="flex items-end gap-24">
        {(["a", "b"] as const).map((side) => {
          const chips = side === "a" ? 2 : 1;
          const isWinner = side === "a";
          return (
            <div key={side} className="flex flex-col items-center gap-5">
              {isWinner ? (
                <Badge variant="secondary" style={{ opacity: winner }}>
                  majority
                </Badge>
              ) : null}
              <div
                className="flex flex-col-reverse gap-3"
                style={{
                  scale: `${1 + (isWinner ? 0.08 * winner : 0)} ${1 + (isWinner ? 0.08 * winner : 0)}`,
                }}
              >
                {Array.from({ length: chips }, (_, i) => (
                  <div
                    key={i}
                    className={`h-16 w-44 rounded-md border ${
                      isWinner
                        ? "border-amber bg-amber"
                        : "border-border-subtle bg-raised"
                    }`}
                    style={{
                      opacity: rise[i] ?? 0,
                      translate: `0px ${(1 - (rise[i] ?? 0)) * 40}px`,
                    }}
                  />
                ))}
              </div>
              <span className="font-mono text-2xl text-text-secondary">
                {side}
              </span>
            </div>
          );
        })}
      </div>
    </Beat>
  );
};

const BEAT_SCENES: Record<(typeof BEATS)[number]["key"], FC> = {
  file: FileBeat,
  draw: DrawBeat,
  vote: VoteBeat,
  rule: RuleBeat,
};

/**
 * S4 · MECHANISM — the loop, one beat per step. The rail up top tracks
 * progress across all four; each beat remounts via its own Sequence so
 * local frame timings stay simple. One Backdrop runs behind all beats.
 */
export function MechanismScene() {
  const frame = useCurrentFrame();
  const starts = BEATS.reduce<number[]>(
    (acc, beat, i) => [...acc, (acc[i - 1] ?? 0) + (BEATS[i - 1]?.frames ?? 0)],
    [],
  );

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="intro-mechanism" />
      <div className="relative flex h-full flex-col p-16">
        <div className="mx-auto flex items-center gap-10">
          {BEATS.map((beat, i) => {
            const start = starts[i] ?? 0;
            const past = frame >= start + beat.frames;
            const active = !past && frame >= start;
            const fill = past ? 1 : active ? (frame - start) / beat.frames : 0;
            return (
              <div key={beat.key} className="flex flex-col items-center gap-2">
                <span
                  className={`font-mono text-lg ${
                    active || past ? "text-amber" : "text-text-secondary"
                  }`}
                >
                  {beat.label}
                </span>
                <div className="h-[3px] w-28 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full bg-amber"
                    style={{ width: `${fill * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="relative flex-1">
          {BEATS.map((beat, i) => {
            const Scene = BEAT_SCENES[beat.key];
            return (
              <Sequence
                key={beat.key}
                from={starts[i]}
                durationInFrames={beat.frames}
              >
                <Scene />
              </Sequence>
            );
          })}
        </div>
      </div>
    </div>
  );
}
