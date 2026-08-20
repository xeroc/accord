import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ChainStrip,
  MonoChip,
  RulingStamp,
  StateNode,
  TokenBadge,
} from "@useaccord/ui";
import {
  Interactive,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { FC, ReactNode } from "react";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Beat, Scene } from "../../../src/shell/scene";
import { StepRail } from "../../../src/shell/rail";

const ITEM_ID = "$WIF · 7xKX…gQ2v";

/** Beat lengths sum to 330 (11s @ 30fps). */
const BEATS = [
  { key: "submit", frames: 105, label: "01 · submit" },
  { key: "challenge", frames: 105, label: "02 · challenge" },
  { key: "rule", frames: 120, label: "03 · rule" },
] as const;

/** The Canon ledger: the on-chain strip the list card sits on. */
const CanonList: FC<{ frame: number; children: ReactNode }> = ({
  frame,
  children,
}) => (
  <div className="flex flex-col items-center gap-4">
    <ChainStrip
      frame={frame}
      cells={["7xKX", "9fJe", "3aQm", "8zRt", "5pWn", "2kLd"]}
      at={4}
      stagger={5}
      highlight={0}
      highlightAt={30}
      cellWidth={76}
      height={40}
    />
    <Card className="w-[520px]">
      <CardHeader>
        <CardTitle className="font-mono text-xl text-text-secondary">
          canon list
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  </div>
);

/** One ledger row: the item id + its lifecycle pill. */
const ItemRow: FC<{ frame: number; state: string; stateAt: number }> = ({
  frame,
  state,
  stateAt,
}) => (
  <div className="flex items-center justify-between gap-6 font-mono text-2xl">
    <span className="text-nearwhite">{ITEM_ID}</span>
    <StateNode frame={frame} label={state} activeAt={stateAt} />
  </div>
);

/** 01 · submit — anyone drops an item in, deposit locks under it. */
const SubmitBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Beat copy="anyone submits — skin in the game." sub="submit_item()">
      <div className="flex items-center gap-12">
        <Interactive.Div
          name="Submitted item card"
          className="w-[420px]"
          style={{
            opacity: enterAt(frame, fps, 1.0, 0.5),
            translate: interpolate(
              frame,
              [1.0 * fps, 1.6 * fps],
              ["-220px 0px", "0px 0px"],
              { easing: EASE_EXPO, ...clamp },
            ),
          }}
        >
          <Card className="ring-2 ring-amber">
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                {ITEM_ID}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TokenBadge
                frame={frame}
                tone="fee"
                amount={500}
                label="locked"
                at={Math.round(1.8 * fps)}
                className="px-4 py-2 text-lg"
              />
            </CardContent>
          </Card>
        </Interactive.Div>

        <Interactive.Div
          name="Canon ledger"
          style={{ opacity: enterAt(frame, fps, 0.1, 0.5) }}
        >
          <CanonList frame={frame}>
            <Interactive.Div
              name="Listed row"
              style={{ opacity: enterAt(frame, fps, 1.9, 0.4) }}
            >
              <ItemRow frame={frame} state="PENDING" stateAt={Math.round(2.2 * fps)} />
            </Interactive.Div>
          </CanonList>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** 02 · challenge — a diagonal strike lands; the challenger stakes too. */
const ChallengeBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strike = enterAt(frame, fps, 0.7, 0.35);
  return (
    <Beat copy="anyone challenges — stake at risk." sub="challenge_item()">
      <div className="flex flex-col items-center gap-9">
        <Interactive.Div
          name="Challenged ledger"
          style={{ opacity: enterAt(frame, fps, 0.1, 0.4) }}
        >
          <CanonList frame={frame}>
            <div className="relative">
              <ItemRow frame={frame} state="PENDING" stateAt={4} />
              <Interactive.Div
                name="Challenge strike"
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="h-[6px] w-[125%] origin-left -rotate-12 rounded-full bg-slash"
                  style={{ scale: `${strike} 1` }}
                />
              </Interactive.Div>
            </div>
          </CanonList>
        </Interactive.Div>
        <div className="flex items-center gap-5">
          <Interactive.Div
            name="Challenger stake chip"
            style={{ opacity: enterAt(frame, fps, 1.4, 0.4) }}
          >
            <MonoChip tone="slash" className="px-6 py-2.5 text-2xl">
              challenge 250
            </MonoChip>
          </Interactive.Div>
          <Interactive.Div
            name="Accord fee chip"
            style={{ opacity: enterAt(frame, fps, 1.6, 0.4) }}
          >
            <MonoChip tone="neutral" className="px-6 py-2.5 text-2xl">
              + fee
            </MonoChip>
          </Interactive.Div>
        </div>
      </div>
    </Beat>
  );
};

/** 03 · rule — two wires to the sealed court; the ruling descends. */
const RuleBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wireOut = enterAt(frame, fps, 0.4, 0.45);
  const wireBack = enterAt(frame, fps, 1.1, 0.45);
  const drop = interpolate(
    frame,
    [1.7 * fps, 2.1 * fps],
    ["-170px", "0px"],
    { easing: EASE_EXPO, ...clamp },
  );
  return (
    <Beat
      copy="a drawn jury rules."
      sub="create_dispute() → get_ruling()"
      copyClass="text-6xl"
    >
      <div className="flex items-center gap-8">
        <div className="relative">
          <Interactive.Div
            name="Canon ledger under ruling"
            style={{ opacity: enterAt(frame, fps, 0.1, 0.4) }}
          >
            <CanonList frame={frame}>
              <ItemRow
                frame={frame}
                state="LISTED"
                stateAt={Math.round(2.8 * fps)}
              />
            </CanonList>
          </Interactive.Div>
          <Interactive.Div
            name="Ruling drop"
            className="absolute -top-8 left-1/2 z-10"
            style={{ translate: `-50% ${drop}` }}
          >
            <RulingStamp frame={frame} text="KEEP" at={Math.round(2.0 * fps)} />
          </Interactive.Div>
        </div>

        <div className="flex w-[260px] flex-col gap-4">
          <Interactive.Div
            name="Dispute wire"
            className="flex flex-col items-center gap-2"
            style={{ opacity: enterAt(frame, fps, 0.25, 0.4) }}
          >
            <span className="font-mono text-xl text-slash">dispute →</span>
            <div
              className="h-[3px] w-full origin-left rounded-full bg-slash"
              style={{ scale: `${wireOut} 1` }}
            />
          </Interactive.Div>
          <Interactive.Div
            name="Ruling wire"
            className="flex flex-col items-center gap-2"
            style={{ opacity: enterAt(frame, fps, 0.95, 0.4) }}
          >
            <div
              className="h-[3px] w-full origin-right rounded-full bg-amber"
              style={{ scale: `${wireBack} 1` }}
            />
            <span className="font-mono text-xl text-amber">← ruling</span>
          </Interactive.Div>
        </div>

        <Interactive.Div
          name="Sealed accord box"
          style={{
            opacity: enterAt(frame, fps, 0.2, 0.5),
            translate: `0px ${(1 - enterAt(frame, fps, 0.2, 0.5)) * 24}px`,
          }}
        >
          <Card className="w-[320px]">
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                accord · court
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MonoChip tone="neutral">sealed</MonoChip>
            </CardContent>
          </Card>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

const BEAT_SCENES: Record<(typeof BEATS)[number]["key"], FC> = {
  submit: SubmitBeat,
  challenge: ChallengeBeat,
  rule: RuleBeat,
};

/**
 * S4 · MECHANISM — the Canon loop, one beat per step. The rail up top
 * tracks progress across all three; each beat remounts via its own
 * Sequence so local frame timings stay simple. One Backdrop runs
 * behind all beats.
 */
export function MechanismScene() {
  const starts = BEATS.reduce<number[]>(
    (acc, beat, i) => [...acc, (acc[i - 1] ?? 0) + (BEATS[i - 1]?.frames ?? 0)],
    [],
  );

  return (
    <Scene seed="canon-intro-mechanism">
      <div className="relative flex h-full flex-col p-16">
        <StepRail steps={BEATS.map(({ frames, label }) => ({ frames, label }))} />
        <div className="relative flex-1">
          {BEATS.map((beat, i) => {
            const BeatScene = BEAT_SCENES[beat.key];
            return (
              <Sequence
                key={beat.key}
                from={starts[i]}
                durationInFrames={beat.frames}
              >
                <BeatScene />
              </Sequence>
            );
          })}
        </div>
      </div>
    </Scene>
  );
}
