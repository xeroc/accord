import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DeltaChip,
  LedgerCounter,
  MonoChip,
  RulingStamp,
  TokenBadge,
} from "@useaccord/ui";
import {
  Interactive,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { FC } from "react";

import { EASE_EXPO, SPRING } from "../../../src/shell/presets";
import { clamp, enterAt, since } from "../../../src/shell/anim";
import { Beat, Scene } from "../../../src/shell/scene";
import { StepRail } from "../../../src/shell/rail";

/** Beat lengths sum to 600 (20s @ 30fps). */
const BEATS = [
  { key: "deposit", frames: 180, label: "01 · deposit" },
  { key: "armor", frames: 210, label: "02 · armor" },
  { key: "bounty", frames: 210, label: "03 · bounty" },
] as const;

/** THE item — same token card across all three beats. */
const ITEM_ADDR = "7xKX…gQ2v";

/** The deposit pile: five amber blocks = 500 locked. */
const PileBlocks: FC<{ frame: number }> = ({ frame }) => (
  <div className="flex gap-2">
    {Array.from({ length: 5 }, (_, i) => {
      const land = enterAt(frame, 30, 0.7 + i * 0.14, 0.3);
      return (
        <div
          key={i}
          className="h-12 flex-1 rounded-md border border-amber bg-amber"
          style={{ opacity: land, translate: `0px ${(1 - land) * 26}px` }}
        />
      );
    })}
  </div>
);

/** 01 · deposit — chips weld in, a yank fails, they snap back. */
const DepositBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardIn = enterAt(frame, fps, 0.1, 0.6);
  const cardX = interpolate(frame, [0.1 * fps, 0.7 * fps], ["-160px", "0px"], {
    easing: EASE_EXPO,
    ...clamp,
  });

  // The failed pull: yank away f78–105, 2-frame snap-back, settle.
  const pull = interpolate(frame, [78, 105], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const snapX =
    frame < 105
      ? 36 * pull
      : interpolate(frame, [105, 106.5, 109], [36, -5, 0], {
          easing: [EASE_EXPO, EASE_EXPO],
          ...clamp,
        });
  const snapY =
    frame < 105
      ? -26 * pull
      : interpolate(frame, [105, 106.5, 109], [-26, 3, 0], {
          easing: [EASE_EXPO, EASE_EXPO],
          ...clamp,
        });

  const arrowIn = enterAt(frame, fps, 2.7, 0.3);
  const arrowBreak = interpolate(frame, [105, 112], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const crossOp = interpolate(frame, [106, 112, 126], [0, 1, 0], {
    easing: [EASE_EXPO, EASE_EXPO],
    ...clamp,
  });

  return (
    <Beat
      copy="deposit locked."
      sub="no exit past a live challenge."
      copyClass="text-6xl"
    >
      <div className="flex flex-col items-center gap-7">
        <Interactive.Div
          name="Item card"
          className="w-[430px]"
          style={{ opacity: cardIn, translate: `${cardX} 0px` }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 font-mono text-xl text-text-secondary">
                <TokenBadge frame={frame} tone="stake" amount="$WIF" at={6} />
                <span>{ITEM_ADDR}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="relative">
              <Interactive.Div
                name="Deposit chips"
                style={{ translate: `${snapX}px ${snapY}px` }}
              >
                <PileBlocks frame={frame} />
              </Interactive.Div>
              {/* the pull arrow — attached to the chips, breaks on snap */}
              <Interactive.Div
                name="Pull arrow"
                className="absolute -top-7 right-0 flex items-center"
                style={{
                  opacity: arrowIn * (1 - arrowBreak),
                  rotate: "-35deg",
                  translate: `${arrowBreak * 26}px ${arrowBreak * -20}px`,
                }}
              >
                <div className="h-[3px] w-24 bg-slash" />
                <div className="h-0 w-0 border-y-[7px] border-l-[12px] border-y-transparent border-l-slash" />
              </Interactive.Div>
              <Interactive.Div
                name="Break cross"
                className="absolute -top-8 right-2 h-7 w-7"
                style={{ opacity: crossOp }}
              >
                <div className="absolute top-1/2 h-[3px] w-full origin-center rotate-45 rounded-full bg-slash" />
                <div className="absolute top-1/2 h-[3px] w-full origin-center -rotate-45 rounded-full bg-slash" />
              </Interactive.Div>
            </CardContent>
          </Card>
        </Interactive.Div>
        <Interactive.Div
          name="Locked chip"
          style={{ opacity: enterAt(frame, fps, 1.8, 0.35) }}
        >
          <MonoChip tone="amber" className="px-5 py-2.5 text-2xl">
            500 locked
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** Motion state of one strike: bolt travels + bounces, chips stop at impact. */
interface StrikeMotion {
  impact: number;
  boltX: number;
  boltY: number;
  boltOp: number;
  chipsX: number;
  chipsY: number;
}

/** One slash strike: bolt springs in on a diagonal, bounces off empty. */
const strikeMotion = (
  frame: number,
  fps: number,
  start: number,
  from: readonly [number, number],
): StrikeMotion => {
  const t = spring({ frame: since(frame, start), fps, config: SPRING.snappy });
  const impact = start + 14;
  const awayX = interpolate(frame, [impact, impact + 20], [0, -170], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const awayY = interpolate(frame, [impact, impact + 20], [0, -120], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const fade = interpolate(frame, [impact, impact + 18], [1, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const approachX = from[0] * (1 - t);
  const approachY = from[1] * (1 - t);
  return {
    impact,
    boltX: approachX + awayX,
    boltY: approachY + awayY,
    boltOp: fade,
    chipsX: approachX,
    chipsY: approachY,
  };
};

/** Stake chips of a failed strike: flip slash→amber, slide to the plate. */
const ArmorChips: FC<{
  frame: number;
  strike: StrikeMotion;
  flipAt: number;
  slideTo: readonly [number, number];
  plate: "top" | "bottom";
  plateAt: number;
}> = ({ frame, strike, flipAt, slideTo, plate, plateAt }) => {
  const flip = interpolate(frame, [flipAt, flipAt + 18], [0, 180], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const slide = interpolate(frame, [flipAt + 18, flipAt + 34], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const gone = interpolate(frame, [flipAt + 32, flipAt + 40], [1, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const x = strike.chipsX + slideTo[0] * slide;
  const y = strike.chipsY + slideTo[1] * slide;
  const platePop = enterAt(frame, 30, plateAt / 30, 0.25);
  return (
    <>
      {[0, 1].map((i) => (
        <Interactive.Div
          key={i}
          name={`Forfeited stake ${i}`}
          className="absolute"
          style={{
            left: 436 + i * 16,
            top: 30 + i * 22 + (plate === "bottom" ? 90 : 0),
            translate: `${x}px ${y}px`,
          }}
        >
          <div style={{ perspective: 600 }}>
            <div
              className="relative h-9 w-14"
              style={{
                transformStyle: "preserve-3d",
                transform: `rotateY(${flip}deg)`,
                opacity: gone,
              }}
            >
              <div
                className="absolute inset-0 rounded-md border border-slash bg-slash/70"
                style={{ backfaceVisibility: "hidden" }}
              />
              <div
                className="absolute inset-0 rounded-md border border-amber bg-amber"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              />
            </div>
          </div>
        </Interactive.Div>
      ))}
      <Interactive.Div
        name={`Armor plate ${plate}`}
        className={`absolute left-1 w-2.5 rounded-full bg-amber ${
          plate === "top" ? "top-8 h-24" : "bottom-8 h-24"
        }`}
        style={{ opacity: platePop, scale: `1 ${0.3 + 0.7 * platePop}` }}
      />
    </>
  );
};

/** 02 · armor — two failed strikes plate the card; the pile ticks up. */
const ArmorBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardIn = enterAt(frame, fps, 0.1, 0.6);
  const cardX = interpolate(frame, [0.1 * fps, 0.7 * fps], ["-160px", "0px"], {
    easing: EASE_EXPO,
    ...clamp,
  });

  const s1 = strikeMotion(frame, fps, 22, [260, -190]);
  const s2 = strikeMotion(frame, fps, 112, [260, -190]);
  const bump = (impact: number) =>
    interpolate(frame, [impact, impact + 3, impact + 10], [1, 1.03, 1], {
      easing: [EASE_EXPO, EASE_EXPO],
      ...clamp,
    });
  const bumpAll = bump(s1.impact) * bump(s2.impact);
  const ring = (impact: number) => ({
    op: interpolate(frame, [impact, impact + 9], [0.9, 0], {
      easing: EASE_EXPO,
      ...clamp,
    }),
    scale: interpolate(frame, [impact, impact + 9], [1, 1.18], {
      easing: EASE_EXPO,
      ...clamp,
    }),
  });
  const r1 = ring(s1.impact);
  const r2 = ring(s2.impact);

  // pile ticker: 500 → 750 on strike 1, 750 → 1125 on strike 2
  const tickAOp =
    enterAt(frame, fps, 0.4, 0.3) *
    interpolate(frame, [138, 144], [1, 0], { easing: EASE_EXPO, ...clamp });
  const tickBOp = interpolate(frame, [142, 148], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });

  return (
    <Beat
      copy="failed attack? your stake joins their armor."
      sub="progressive protection"
    >
      <div className="flex flex-col items-center gap-6">
        <Interactive.Div
          name="Item card"
          className="relative w-[430px]"
          style={{ opacity: cardIn, translate: `${cardX} 0px` }}
        >
          <div style={{ scale: `${bumpAll} ${bumpAll}` }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 font-mono text-xl text-text-secondary">
                  <TokenBadge frame={frame} tone="stake" amount="$WIF" at={6} />
                  <span>{ITEM_ADDR}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PileBlocks frame={frame} />
              </CardContent>
            </Card>
          </div>

          {/* strike layer */}
          <div className="pointer-events-none absolute inset-0">
            <Interactive.Div
              name="Strike 1 bolt"
              className="absolute left-[300px] top-[44px] h-1.5 w-36 origin-center rounded-full bg-slash"
              style={{
                rotate: "-36deg",
                translate: `${s1.boltX}px ${s1.boltY}px`,
                opacity: s1.boltOp,
              }}
            />
            <Interactive.Div
              name="Strike 1 ring"
              className="absolute left-[332px] top-[8px] h-20 w-20 rounded-full border-2 border-amber"
              style={{ opacity: r1.op, scale: `${r1.scale} ${r1.scale}` }}
            />
            <ArmorChips
              frame={frame}
              strike={s1}
              flipAt={46}
              slideTo={[-428, 20]}
              plate="top"
              plateAt={80}
            />
            <Interactive.Div
              name="Strike 2 bolt"
              className="absolute left-[300px] top-[134px] h-1.5 w-36 origin-center rounded-full bg-slash"
              style={{
                rotate: "-36deg",
                translate: `${s2.boltX}px ${s2.boltY}px`,
                opacity: s2.boltOp,
              }}
            />
            <Interactive.Div
              name="Strike 2 ring"
              className="absolute left-[332px] top-[98px] h-20 w-20 rounded-full border-2 border-amber"
              style={{ opacity: r2.op, scale: `${r2.scale} ${r2.scale}` }}
            />
            <ArmorChips
              frame={frame}
              strike={s2}
              flipAt={136}
              slideTo={[-428, 0]}
              plate="bottom"
              plateAt={170}
            />
          </div>
        </Interactive.Div>

        {/* the pile ticker */}
        <div className="relative h-14 w-[340px]">
          <Interactive.Div
            name="Pile ticker a"
            className="absolute inset-0"
            style={{ opacity: tickAOp }}
          >
            <LedgerCounter
              frame={frame}
              label="stake locked"
              from={500}
              to={750}
              at={52}
              tone="amber"
              className="w-full rounded-lg border border-border-subtle bg-raised px-5 py-3 text-2xl"
            />
          </Interactive.Div>
          <Interactive.Div
            name="Pile ticker b"
            className="absolute inset-0"
            style={{ opacity: tickBOp }}
          >
            <LedgerCounter
              frame={frame}
              label="stake locked"
              from={750}
              to={1125}
              at={146}
              tone="amber"
              className="w-full rounded-lg border border-border-subtle bg-raised px-5 py-3 text-2xl"
            />
          </Interactive.Div>
        </div>

        <div className="flex items-center gap-5">
          <Interactive.Div
            name="Armor chip 1"
            style={{ opacity: enterAt(frame, fps, 84 / 30, 0.3) }}
          >
            <MonoChip tone="amber" className="px-5 py-2 text-xl">
              +250 armor
            </MonoChip>
          </Interactive.Div>
          <Interactive.Div
            name="Armor chip 2"
            style={{ opacity: enterAt(frame, fps, 174 / 30, 0.3) }}
          >
            <MonoChip tone="amber" className="px-5 py-2 text-xl">
              +375 armor
            </MonoChip>
          </Interactive.Div>
        </div>
      </div>
    </Beat>
  );
};

/** 03 · bounty — the honest strike lands clean and takes everything. */
const BountyBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardIn = enterAt(frame, fps, 0.1, 0.6);
  const cardX = interpolate(frame, [0.1 * fps, 0.7 * fps], ["-160px", "0px"], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const challengerIn = enterAt(frame, fps, 0.35, 0.6);
  const challengerX = interpolate(
    frame,
    [0.35 * fps, 0.95 * fps],
    ["160px", "0px"],
    { easing: EASE_EXPO, ...clamp },
  );

  // the honest strike: springs in, lodges — no bounce
  const t = spring({ frame: since(frame, 30), fps, config: SPRING.snappy });
  const lodge = interpolate(frame, [44, 52], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const boltX = 240 * (1 - t) + 6 * lodge;
  const boltY = -180 * (1 - t) + 4 * lodge;
  const ringOp = interpolate(frame, [44, 53], [0.9, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const ringScale = interpolate(frame, [44, 53], [1, 1.2], {
    easing: EASE_EXPO,
    ...clamp,
  });

  // ruling descends: REMOVE — then the whole pile slides right
  const stampY = interpolate(frame, [58, 72], ["-150px", "0px"], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const stampOut =
    enterAt(frame, fps, 58 / 30, 0.2) *
    interpolate(frame, [108, 120], [1, 0], { easing: EASE_EXPO, ...clamp });

  const slide = interpolate(frame, [92, 138], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const arc = interpolate(frame, [92, 115, 138], [0, -36, 0], {
    easing: [EASE_EXPO, EASE_EXPO],
    ...clamp,
  });
  const unitIn = interpolate(frame, [90, 94], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const unitOut = interpolate(frame, [148, 160], [1, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const tickerOut = interpolate(frame, [92, 100], [1, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const cardDim = interpolate(frame, [116, 136], [1, 0.35], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const arrowIn = enterAt(frame, fps, 2.0, 0.4);
  const pop = spring({ frame: since(frame, 150), fps, config: SPRING.snappy });

  return (
    <Beat
      copy="right challenger takes the whole pile."
      sub="bounty = full accumulated stake"
    >
      <div className="relative h-[340px] w-[1160px]">
        {/* the item, dimmed by the ruling */}
        <div
          className="absolute left-0 top-[60px] flex w-[430px] flex-col items-center gap-5"
          style={{ opacity: cardIn, translate: `${cardX} 0px` }}
        >
          <Interactive.Div
            name="Ruling stamp"
            className="absolute -top-[86px] left-[36px]"
            style={{ opacity: stampOut, translate: `0px ${stampY}` }}
          >
            <RulingStamp frame={frame} text="REMOVE" at={64} size="md" />
          </Interactive.Div>
          <Interactive.Div
            name="Item card"
            className="relative w-[430px]"
            style={{ opacity: cardDim }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 font-mono text-xl text-text-secondary">
                  <TokenBadge frame={frame} tone="stake" amount="$WIF" at={6} />
                  <span>{ITEM_ADDR}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PileBlocks frame={frame} />
              </CardContent>
            </Card>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1 top-8 h-24 w-2.5 rounded-full bg-amber" />
              <div className="absolute bottom-8 left-1 h-24 w-2.5 rounded-full bg-amber" />
              <Interactive.Div
                name="Honest strike bolt"
                className="absolute left-[296px] top-[40px] h-1.5 w-36 origin-center rounded-full bg-confirm"
                style={{ rotate: "-36deg", translate: `${boltX}px ${boltY}px` }}
              />
              <Interactive.Div
                name="Honest strike ring"
                className="absolute left-[328px] top-[4px] h-20 w-20 rounded-full border-2 border-confirm"
                style={{ opacity: ringOp, scale: `${ringScale} ${ringScale}` }}
              />
            </div>
          </Interactive.Div>
          <Interactive.Div name="Pile ticker" style={{ opacity: tickerOut }}>
            <LedgerCounter
              frame={frame}
              label="stake locked"
              to={1125}
              tone="amber"
              className="w-[340px] rounded-lg border border-border-subtle bg-raised px-5 py-3 text-2xl"
            />
          </Interactive.Div>
        </div>

        {/* the path: pile moves right */}
        <Interactive.Div
          name="Payout path"
          className="absolute left-[470px] top-[168px] flex items-center"
          style={{ opacity: arrowIn }}
        >
          <div className="h-[3px] w-[160px] rounded-full bg-border-subtle" />
          <div className="h-0 w-0 border-y-[8px] border-l-[14px] border-y-transparent border-l-border-subtle" />
        </Interactive.Div>

        {/* the whole pile, sliding to the challenger */}
        <Interactive.Div
          name="Whole pile transfer"
          className="absolute left-[44px] top-[150px] flex items-center gap-2"
          style={{
            opacity: unitIn * unitOut,
            translate: `${slide * 665}px ${arc}px`,
            scale: `${1 - 0.15 * slide} ${1 - 0.15 * slide}`,
          }}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-12 w-16 rounded-md border border-amber bg-amber"
            />
          ))}
          <div className="h-12 w-2.5 rounded-full bg-amber" />
          <div className="h-12 w-2.5 rounded-full bg-amber" />
        </Interactive.Div>

        {/* the challenger */}
        <Interactive.Div
          name="Challenger card"
          className="absolute right-0 top-[40px] w-[330px]"
          style={{ opacity: challengerIn, translate: `${challengerX} 0px` }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                challenger · 9vNe…pQ4t
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex h-16 items-center rounded-md border border-dashed border-border-subtle px-4">
                <LedgerCounter
                  frame={frame}
                  label="bounty"
                  from={0}
                  to={1125}
                  at={120}
                  dur={34}
                  tone="confirm"
                  className="w-full text-2xl"
                />
              </div>
              <Interactive.Div
                name="Bounty chip"
                className="flex justify-center"
              >
                <DeltaChip
                  tone="confirm"
                  sign="+"
                  amount={1125}
                  label="bounty"
                  pop={pop}
                  className="px-6 py-3 text-2xl"
                />
              </Interactive.Div>
            </CardContent>
          </Card>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

const BEAT_SCENES: Record<(typeof BEATS)[number]["key"], FC> = {
  deposit: DepositBeat,
  armor: ArmorBeat,
  bounty: BountyBeat,
};

/**
 * S2 · MECHANISM — deposit → armor → bounty, one beat per step. The
 * rail up top tracks progress; each beat remounts via its own Sequence
 * so local frame timings stay simple. One Backdrop runs behind all.
 */
export function MechanismScene() {
  const starts = BEATS.reduce<number[]>(
    (acc, beat, i) => [...acc, (acc[i - 1] ?? 0) + (BEATS[i - 1]?.frames ?? 0)],
    [],
  );

  return (
    <Scene seed="canon-econ-mechanism">
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
