import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeltaChip,
  JurorPool,
  MonoChip,
  RulingStamp,
  StateNode,
} from "@useaccord/ui";
import {
  Interactive,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { FC } from "react";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Beat, Scene } from "../../../src/shell/scene";
import { StepRail } from "../../../src/shell/rail";

/** Beat lengths sum to 600 (20s @ 30fps). */
const BEATS = [
  { key: "stake", frames: 180, label: "01 · stake" },
  { key: "case", frames: 225, label: "02 · case" },
  { key: "verdict", frames: 195, label: "03 · verdict" },
] as const;

/** Item's accumulated pile vs the challenger's mirror — half to play. */
const ACCUMULATED = 4;
const CHALLENGE = 2;

const StakeBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Beat copy="anyone. anytime." sub="challenge_item()">
      <div className="flex flex-col items-center gap-12" style={{ scale: "1.4 1.4" }}>
        <div className="flex items-end gap-24">
          <div className="flex flex-col items-center gap-5">
            <Interactive.Div
              name="Accumulated stack"
              className="flex flex-col-reverse gap-2"
              style={{ opacity: enterAt(frame, fps, 0.2, 0.5) }}
            >
              {Array.from({ length: ACCUMULATED }, (_, i) => {
                const e = enterAt(frame, fps, 0.35 + i * 0.15, 0.4);
                return (
                  <div
                    key={i}
                    className="h-9 w-44 rounded-md border border-amber bg-amber"
                    style={{ opacity: e, translate: `0px ${(1 - e) * 26}px` }}
                  />
                );
              })}
            </Interactive.Div>
            <span className="font-mono text-2xl text-text-secondary">
              accumulated · $WlF
            </span>
          </div>
          <span className="pb-12 font-mono text-3xl text-muted-foreground">vs</span>
          <div className="flex flex-col items-center gap-5">
            <Interactive.Div
              name="Challenge stack"
              className="flex flex-col-reverse gap-2"
              style={{ opacity: enterAt(frame, fps, 0.9, 0.5) }}
            >
              {Array.from({ length: CHALLENGE }, (_, i) => {
                const e = enterAt(frame, fps, 1.05 + i * 0.15, 0.4);
                return (
                  <div
                    key={i}
                    className="h-9 w-44 rounded-md border border-amber bg-amber"
                    style={{ opacity: e, translate: `0px ${(1 - e) * 26}px` }}
                  />
                );
              })}
            </Interactive.Div>
            <span className="font-mono text-2xl text-text-secondary">
              challenge stake
            </span>
          </div>
        </div>
        <Interactive.Div
          name="Ratio row"
          className="flex items-center gap-4"
          style={{ opacity: enterAt(frame, fps, 1.8, 0.5) }}
        >
          <MonoChip tone="neutral" className="px-5 py-2.5 text-2xl">
            challenge =
          </MonoChip>
          <MonoChip tone="amber" className="px-5 py-2.5 text-2xl">
            50% × accumulated
          </MonoChip>
          <MonoChip tone="neutral" className="px-5 py-2.5 text-2xl">
            + fee
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** One dispute, two options — public rules, sealed evidence, drawn jurors. */
const CaseBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const split = enterAt(frame, fps, 0.5, 0.6);
  const envTravel = interpolate(
    frame,
    [1.9 * fps, 2.7 * fps],
    ["-460px 0px", "0px 0px"],
    { easing: EASE_EXPO, ...clamp },
  );
  return (
    <Beat
      copy="one case: keep | remove."
      sub="create_dispute() · options [keep, remove]"
    >
      <div className="flex flex-col items-center gap-9" style={{ scale: "1.4 1.4" }}>
        <div className="flex items-center gap-8">
          <Interactive.Div
            name="Option keep"
            className="w-[330px]"
            style={{
              opacity: enterAt(frame, fps, 0.1, 0.4),
              translate: `${(1 - split) * 70}px 0px`,
            }}
          >
            <Card>
              <CardContent className="flex h-[110px] items-center justify-center">
                <span className="font-mono text-4xl text-text-secondary">keep</span>
              </CardContent>
            </Card>
          </Interactive.Div>
          <Interactive.Div
            name="Split seam"
            className="h-[110px] w-[3px] rounded-full bg-amber"
            style={{ scale: `1 ${split}` }}
          />
          <Interactive.Div
            name="Option remove"
            className="w-[330px]"
            style={{
              opacity: enterAt(frame, fps, 0.1, 0.4),
              translate: `${(1 - split) * -70}px 0px`,
            }}
          >
            <Card className="ring-amber">
              <CardContent className="flex h-[110px] items-center justify-center">
                <span className="font-mono text-4xl text-amber">remove</span>
              </CardContent>
            </Card>
          </Interactive.Div>
        </div>

        <div className="flex items-center gap-12">
          <Interactive.Div
            name="Evidence envelope"
            className="w-[280px]"
            style={{ opacity: enterAt(frame, fps, 1.9, 0.3), translate: envTravel }}
          >
            <Card size="sm">
              <CardHeader>
                <CardTitle className="font-mono text-lg text-text-secondary">
                  evidence · sealed
                </CardTitle>
              </CardHeader>
            </Card>
          </Interactive.Div>
          <Interactive.Div name="Juror dots">
            <JurorPool
              frame={frame}
              count={3}
              cols={3}
              dotSize={16}
              label="jurors"
              drawnAt={(d) => (2.7 + d * 0.2) * fps}
            />
          </Interactive.Div>
        </div>

        <Interactive.Div
          name="Rules and evidence chips"
          className="flex items-center gap-4"
          style={{ opacity: enterAt(frame, fps, 3.6, 0.5) }}
        >
          <span className="font-mono text-2xl text-text-secondary">canon list</span>
          <div className="h-[2px] w-14 rounded-full bg-amber" />
          <MonoChip tone="amber" className="px-4 py-2 text-xl">
            rules_hash
          </MonoChip>
          <MonoChip tone="neutral" className="px-4 py-2 text-xl">
            public rules
          </MonoChip>
          <MonoChip tone="amber" className="px-4 py-2 text-xl">
            sealed evidence
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/**
 * 03 · verdict — the dispute wires to the sealed court, the ruling
 * descends, and the settlement executes itself: the whole pile walks
 * to the challenger. Centered via Beat like every other beat; all
 * coordinates live inside the 1240×340 stage, nothing overlaps.
 */
const VerdictBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dim = interpolate(frame, [2.9 * fps, 3.3 * fps], [1, 0.4], {
    ...clamp,
  });
  const wireIn = enterAt(frame, fps, 0.5, 0.5);
  const drop = enterAt(frame, fps, 1.5, 0.4);
  return (
    <Beat
      copy="ruling lands. payout executes."
      sub="settle_item() · payout to challenger"
    >
      <div className="relative h-[340px] w-[1240px]" style={{ scale: "1.25 1.25" }}>
        {/* the item under trial — disgraced by the ruling */}
        <Interactive.Div
          name="Fake item group"
          className="absolute left-0 top-0 flex w-[320px] flex-col gap-3"
        >
          <Interactive.Div name="Fake item card" style={{ opacity: dim }}>
            <Card className="ring-slash" size="sm">
              <CardHeader>
                <CardTitle className="font-mono text-xl text-text-secondary">
                  $WlF · fake
                </CardTitle>
              </CardHeader>
            </Card>
          </Interactive.Div>
          <div className="flex flex-col-reverse gap-1.5">
            {Array.from({ length: ACCUMULATED }, (_, i) => {
              const rise = enterAt(frame, fps, 0.3 + i * 0.12, 0.4);
              const slide = interpolate(
                frame,
                [(2.9 + i * 0.15) * fps, (3.5 + i * 0.15) * fps],
                ["0px 0px", "430px 35px"],
                { easing: EASE_EXPO, ...clamp },
              );
              return (
                <div
                  key={i}
                  className="h-8 w-40 rounded-md border border-amber bg-amber"
                  style={{ opacity: rise, translate: slide }}
                />
              );
            })}
          </div>
        </Interactive.Div>
        <Interactive.Div name="Removed state" className="absolute left-0 top-[262px]">
          <StateNode
            frame={frame}
            label="REMOVED"
            at={2.85 * fps}
            activeAt={2.95 * fps}
          />
        </Interactive.Div>

        {/* the sealed court */}
        <Interactive.Div
          name="Accord court box"
          className="absolute right-0 top-0 w-[300px]"
          style={{
            opacity: enterAt(frame, fps, 0.1, 0.5),
            translate: `0px ${(1 - enterAt(frame, fps, 0.1, 0.5)) * 24}px`,
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                accord · court
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">sealed</Badge>
            </CardContent>
          </Card>
        </Interactive.Div>

        {/* dispute wire: item → court */}
        <Interactive.Div
          name="Dispute wire"
          className="absolute left-[340px] top-[86px] flex items-center"
          style={{ opacity: wireIn }}
        >
          <div
            className="h-[3px] w-[520px] origin-left rounded-full bg-amber"
            style={{ transform: `scaleX(${wireIn})` }}
          />
          <div className="h-0 w-0 border-y-[7px] border-l-[12px] border-y-transparent border-l-amber" />
        </Interactive.Div>
        <Interactive.Div
          name="Dispute wire label"
          className="absolute left-[540px] top-[38px]"
          style={{ opacity: enterAt(frame, fps, 1.0, 0.4) }}
        >
          <MonoChip tone="amber" className="px-4 py-2 text-xl">
            dispute →
          </MonoChip>
        </Interactive.Div>

        {/* the ruling: court → settlement */}
        <Interactive.Div
          name="Ruling wire"
          className="absolute right-[172px] top-[116px] h-[100px] w-[3px] origin-top rounded-full bg-amber"
          style={{ scale: `1 ${drop}` }}
        />
        <Interactive.Div
          name="Ruling wire label"
          className="absolute right-[190px] top-[150px] font-mono text-xl text-amber"
          style={{ opacity: enterAt(frame, fps, 1.8, 0.4) }}
        >
          ↓ ruling
        </Interactive.Div>
        <Interactive.Div name="Ruling stamp" className="absolute right-[40px] top-[228px]">
          <RulingStamp frame={frame} text="REMOVE" at={2.0 * fps} size="md" />
        </Interactive.Div>

        {/* the challenger — the pile lands just above, bounty pops beside */}
        <Interactive.Div
          name="Challenger zone"
          className="absolute left-[430px] top-[235px] flex items-center gap-6"
        >
          <span className="font-mono text-2xl text-text-secondary">challenger</span>
          <DeltaChip
            tone="confirm"
            sign="+"
            amount={100 * (ACCUMULATED + CHALLENGE)}
            label="bounty"
            pop={enterAt(frame, fps, 3.6, 0.4)}
          />
        </Interactive.Div>
      </div>
    </Beat>
  );
};

const BEAT_SCENES: Record<(typeof BEATS)[number]["key"], FC> = {
  stake: StakeBeat,
  case: CaseBeat,
  verdict: VerdictBeat,
};

/**
 * S2 · MECHANISM — the challenge loop, one beat per step. The rail up
 * top tracks progress across all three; each beat remounts via its own
 * Sequence so local frame timings stay simple.
 */
export function MechanismScene() {
  const starts = BEATS.reduce<number[]>(
    (acc, beat, i) => [...acc, (acc[i - 1] ?? 0) + (BEATS[i - 1]?.frames ?? 0)],
    [],
  );

  return (
    <Scene seed="canon-challenge-mechanism">
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
