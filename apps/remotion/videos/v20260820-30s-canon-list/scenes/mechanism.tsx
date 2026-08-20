import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  MonoChip,
  TokenBadge,
} from "@useaccord/ui";
import {
  Interactive,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { FC } from "react";

import { enterAt, scramble } from "../../../src/shell/anim";
import { Beat, Scene } from "../../../src/shell/scene";
import { StepRail } from "../../../src/shell/rail";

/** Beat lengths sum to 600 (20s @ 30fps). */
const BEATS = [
  { key: "create", frames: 195, label: "01 · create" },
  { key: "court", frames: 210, label: "02 · court" },
  { key: "locked", frames: 195, label: "03 · locked" },
] as const;

/**
 * The canon list card — the episode's slab. Shared by every beat so the
 * list never drifts between steps. `rowIn(i)` staggers row enters
 * (omit for assembled), `mintAt` pops the mint badges (frames; second
 * badge follows 0.3s later), `sealIn` welds the rules-hash seal into the
 * header, `frost` dims the param rows, `dashed` leaves the mints unbound.
 */
const CanonListCard: FC<{
  frame: number;
  fps: number;
  rowIn?: (i: number) => number;
  mintAt?: number;
  sealIn?: number;
  frost?: number;
  dashed?: boolean;
}> = ({ frame, fps, rowIn, mintAt = 0, sealIn = 1, frost = 0, dashed = false }) => {
  const entered = rowIn ?? (() => 1);
  const dim = 1 - 0.55 * frost;
  const badgeAt = (i: number) => mintAt + i * Math.round(0.3 * fps);
  const rowStyle = (i: number) => ({
    opacity: entered(i) * dim,
    translate: `${(1 - entered(i)) * -24}px 0px`,
  });
  return (
    <Card size="sm" className="w-[520px]">
      <CardHeader>
        <CardTitle className="font-mono text-lg text-text-secondary">
          canon list
        </CardTitle>
        <CardAction>
          <MonoChip
            tone="amber"
            className="text-sm"
            style={{
              opacity: sealIn,
              transform: `scale(${1.25 - 0.25 * sealIn})`,
            }}
          >
            rules_hash · immutable
          </MonoChip>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 font-mono text-xl">
        <div className="flex items-center justify-between" style={rowStyle(0)}>
          <span className="text-text-secondary">stake_mint</span>
          {dashed ? (
            <span className="text-muted-foreground">——</span>
          ) : (
            <TokenBadge
              frame={frame}
              tone="stake"
              amount="USDC"
              at={badgeAt(0)}
              className="px-3 py-1 text-xl"
            />
          )}
        </div>
        <div className="flex items-center justify-between" style={rowStyle(1)}>
          <span className="text-text-secondary">fee_mint</span>
          {dashed ? (
            <span className="text-muted-foreground">——</span>
          ) : (
            <TokenBadge
              frame={frame}
              tone="fee"
              amount="USDC"
              at={badgeAt(1)}
              className="px-3 py-1 text-xl"
            />
          )}
        </div>
        <div className="flex items-center justify-between" style={rowStyle(2)}>
          <span className="text-text-secondary">submit_deposit</span>
          <MonoChip tone="amber" className="px-3 py-1 text-xl">
            500
          </MonoChip>
        </div>
        <div className="flex items-center justify-between" style={rowStyle(3)}>
          <span className="text-text-secondary">listing_window</span>
          <span className="text-nearwhite">5d</span>
        </div>
      </CardContent>
    </Card>
  );
};

/** 01 · create — one transaction assembles the list; the rules doc compresses into an immutable hash seal. */
const CreateBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = enterAt(frame, fps, 0.05, 0.4);
  const rowIn = (i: number) => enterAt(frame, fps, 0.5 + i * 0.3, 0.4);
  const docIn = enterAt(frame, fps, 2.1, 0.5);
  const compress = enterAt(frame, fps, 3.3, 0.6);
  const sealIn = enterAt(frame, fps, 4.5, 0.45);
  const hashOpacity =
    enterAt(frame, fps, 3.1, 0.3) * (1 - enterAt(frame, fps, 4.5, 0.35));
  return (
    <Beat copy="one transaction." sub="create_list()" copyClass="text-6xl">
      <div className="flex flex-col items-center gap-7">
        <div className="flex items-center gap-10">
          <Interactive.Div
            name="Rules doc"
            className="w-[250px] shrink-0"
            style={{
              opacity: docIn * (1 - compress),
              translate: `${compress * 150}px 0px`,
              scale: `${1 - 0.75 * compress} ${1 - 0.75 * compress}`,
            }}
          >
            <Card size="sm">
              <CardHeader>
                <CardTitle className="font-mono text-lg text-text-secondary">
                  rules.md
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {[92, 76, 84, 58].map((w, i) => (
                  <div
                    key={i}
                    className="h-2 rounded-full bg-raised"
                    style={{ width: `${w}%` }}
                  />
                ))}
              </CardContent>
            </Card>
          </Interactive.Div>

          <Interactive.Div
            name="Canon list assembling"
            style={{ opacity: cardIn, translate: `0px ${(1 - cardIn) * 20}px` }}
          >
            <CanonListCard
              frame={frame}
              fps={fps}
              rowIn={rowIn}
              mintAt={Math.round(0.5 * fps)}
              sealIn={sealIn}
            />
          </Interactive.Div>
        </div>

        <Interactive.Div
          name="Sha256 line"
          className="font-mono text-2xl text-text-secondary"
          style={{ opacity: hashOpacity }}
        >
          sha256 → {scramble("canon-rules", frame, "9f2a…c41b", frame >= 4.1 * fps)}
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** 02 · court — the sealed Accord box docks 1:1; jurors self-select into the orbit between them. */
const ORBIT_DOTS = [30, 90, 150, 210, 270, 330];

const CourtBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const listIn = enterAt(frame, fps, 0.1, 0.5);
  const boxIn = enterAt(frame, fps, 0.7, 0.5);
  const bond = enterAt(frame, fps, 1.5, 0.5);
  const pairIn = enterAt(frame, fps, 1.9, 0.4);
  const ringIn = enterAt(frame, fps, 2.0, 0.5);
  return (
    <Beat
      copy="every list mints its own court."
      sub="one list. one court."
      copyClass="text-6xl"
    >
      <div className="flex items-center">
        <Interactive.Div
          name="Canon list docked"
          className="shrink-0"
          style={{ opacity: listIn, translate: `${(1 - listIn) * -60}px 0px` }}
        >
          <CanonListCard frame={frame} fps={fps} />
        </Interactive.Div>

        <div className="relative flex h-[300px] w-[240px] shrink-0 items-center justify-center">
          <Interactive.Div
            name="Court bond"
            className="absolute h-[3px] w-[180px] origin-center rounded-full bg-amber"
            style={{ scale: `${bond} 1` }}
          />
          <div
            className="absolute inset-x-0 flex justify-center"
            style={{ top: "calc(50% - 52px)" }}
          >
            <Interactive.Div
              name="One to one chip"
              style={{ opacity: pairIn, transform: `scale(${0.8 + 0.2 * pairIn})` }}
            >
              <MonoChip tone="amber" className="px-5 py-1.5 text-2xl">
                1:1
              </MonoChip>
            </Interactive.Div>
          </div>
          <Interactive.Div
            name="Juror orbit ring"
            className="absolute h-[240px] w-[200px] rounded-full border border-dashed border-border-subtle"
            style={{ opacity: ringIn }}
          />
          {ORBIT_DOTS.map((deg, i) => {
            const t = (deg * Math.PI) / 180;
            const x = Math.cos(t) * 100;
            const y = Math.sin(t) * 120;
            const dotIn = enterAt(frame, fps, 2.3 + i * 0.28, 0.4);
            return (
              <Interactive.Div
                key={deg}
                name={`Juror dot ${i + 1}`}
                className="absolute h-4 w-4 rounded-full border border-border-subtle bg-raised"
                style={{
                  left: `calc(50% + ${x}px - 8px)`,
                  top: `calc(50% + ${y}px - 8px)`,
                  opacity: dotIn,
                  translate: `${(1 - dotIn) * x * 0.9}px ${(1 - dotIn) * y * 0.9}px`,
                }}
              />
            );
          })}
        </div>

        <Interactive.Div
          name="Accord court box"
          className="w-[360px] shrink-0"
          style={{ opacity: boxIn, translate: `${(1 - boxIn) * 60}px 0px` }}
        >
          <Card size="sm">
            <CardHeader>
              <CardTitle className="font-mono text-lg text-text-secondary">
                accord · court
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 py-4">
              <Badge variant="secondary">sealed</Badge>
              <span className="font-mono text-xl text-muted-foreground">
                dispute →
              </span>
              <span className="font-mono text-xl text-muted-foreground">
                ← ruling
              </span>
            </CardContent>
          </Card>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** 03 · locked — mints stay free, params freeze at creation, authority is the list itself. */
const LockedBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cardIn = enterAt(frame, fps, 0.1, 0.5);
  const mint0 = enterAt(frame, fps, 0.6, 0.6);
  const mint1 = enterAt(frame, fps, 0.85, 0.6);
  const frost = enterAt(frame, fps, 1.7, 0.6);
  const frozenIn = enterAt(frame, fps, 2.4, 0.4);
  const authIn = enterAt(frame, fps, 3.4, 0.5);
  return (
    <Beat
      copy="token-agnostic. param-locked. owned by no one."
      sub="immutable · set-once"
    >
      <div className="flex flex-col items-center gap-5">
        <div className="flex items-center gap-10">
          <Interactive.Div
            name="Free stake mint"
            style={{
              opacity: mint0,
              translate: `0px ${((1 - mint0) * 26 + Math.sin(frame / 24) * 4).toFixed(2)}px`,
            }}
          >
            <TokenBadge
              frame={frame}
              tone="stake"
              amount="USDC"
              className="px-4 py-1.5 text-2xl"
            />
          </Interactive.Div>
          <Interactive.Div
            name="Free fee mint"
            style={{
              opacity: mint1,
              translate: `0px ${((1 - mint1) * 26 + Math.sin(frame / 24 + 2.1) * 4).toFixed(2)}px`,
            }}
          >
            <TokenBadge
              frame={frame}
              tone="fee"
              amount="USDC"
              className="px-4 py-1.5 text-2xl"
            />
          </Interactive.Div>
        </div>

        <Interactive.Div
          name="Canon list frozen"
          style={{ opacity: cardIn, translate: `0px ${(1 - cardIn) * 24}px` }}
        >
          <div className="relative">
            <CanonListCard frame={frame} fps={fps} dashed frost={frost} />
            <div className="absolute -bottom-4 -right-5">
              <Interactive.Div
                name="Params frozen chip"
                style={{
                  opacity: frozenIn,
                  transform: `rotate(-4deg) scale(${0.8 + 0.2 * frozenIn})`,
                }}
              >
                <MonoChip tone="amber" className="px-4 py-1.5 text-xl">
                  params frozen
                </MonoChip>
              </Interactive.Div>
            </div>
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Authority chip"
          style={{
            opacity: authIn,
            scale: `${0.85 + 0.15 * authIn} ${0.85 + 0.15 * authIn}`,
          }}
        >
          <MonoChip tone="amber" className="px-6 py-2.5 text-2xl">
            authority: the list itself
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

const BEAT_SCENES: Record<(typeof BEATS)[number]["key"], FC> = {
  create: CreateBeat,
  court: CourtBeat,
  locked: LockedBeat,
};

/**
 * S2 · MECHANISM — the birth of a list, one rail step per beat. Each
 * beat remounts via its own Sequence so local frame timings stay
 * simple. One Backdrop runs behind all beats.
 */
export function MechanismScene() {
  const starts = BEATS.reduce<number[]>(
    (acc, beat, i) => [...acc, (acc[i - 1] ?? 0) + (BEATS[i - 1]?.frames ?? 0)],
    [],
  );

  return (
    <Scene seed="canon-list-mechanism">
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
