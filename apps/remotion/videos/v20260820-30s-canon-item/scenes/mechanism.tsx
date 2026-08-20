import {
  Card,
  LedgerCounter,
  MonoChip,
  StateNode,
  TokenBadge,
} from "@useaccord/ui";
import {
  Easing,
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

/** Beat lengths sum to 630 (21s @ 30fps). */
const BEATS = [
  { key: "submit", frames: 150, label: "01 · submit" },
  { key: "pending", frames: 165, label: "02 · pending" },
  { key: "listed", frames: 150, label: "03 · listed" },
  { key: "exit", frames: 165, label: "04 · exit" },
] as const;

const ITEM_W = 560;
const ITEM_H = 104;

/**
 * THE ITEM — one token card, the protagonist of all four beats.
 * `weld` (0→1) pops the permanent deposit chip on; 1 = already welded.
 */
const ItemCard: FC<{ frame: number; weld?: number }> = ({ frame, weld = 1 }) => (
  <div className="relative" style={{ width: ITEM_W, height: ITEM_H }}>
    <Card className="flex h-full w-full items-center justify-between px-7">
      <span className="font-mono text-xl text-text-secondary">
        $WIF · 7xKX…gQ2v
      </span>
      <TokenBadge frame={frame} tone="fee" amount="$WIF" label="fee_mint" />
    </Card>
    <div
      className="absolute -bottom-4 right-8"
      style={{ opacity: weld, scale: `${0.7 + 0.3 * weld} ${0.7 + 0.3 * weld}` }}
    >
      <MonoChip tone="amber" className="bg-raised px-4 py-2 text-lg">
        deposit 500 · locked
      </MonoChip>
    </div>
  </div>
);

/**
 * WindowArc — the public challenge window as a thin amber perimeter
 * depleting around the item. `consumed` 0→1 is elapsed window.
 */
const WindowArc: FC<{ consumed: number; opacity?: number }> = ({
  consumed,
  opacity = 1,
}) => (
  <svg
    className="pointer-events-none absolute"
    style={{ left: -12, top: -12, opacity }}
    width={ITEM_W + 24}
    height={ITEM_H + 24}
    viewBox={`0 0 ${ITEM_W + 24} ${ITEM_H + 24}`}
  >
    <rect
      x={2.5}
      y={2.5}
      width={ITEM_W + 19}
      height={ITEM_H + 19}
      rx={18}
      pathLength={1}
      fill="none"
      strokeWidth={3}
      className="stroke-amber"
      strokeDasharray={1}
      strokeDashoffset={consumed}
    />
  </svg>
);

/** 01 · submit — the item slides into the canon list; the deposit welds on. */
const SubmitBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Beat copy="submit. deposit. wait." sub="submit_item() · deposit 500">
      <Interactive.Div
        name="Canon list ledger"
        className="flex w-[680px] flex-col gap-4 rounded-2xl border border-border-subtle bg-raised/30 p-6"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.4), scale: "1.5 1.5" }}
      >
        <div className="flex items-center justify-between px-1">
          <span className="font-mono text-xl text-text-secondary">canon list</span>
          <LedgerCounter
            frame={frame}
            label="item_count"
            from={2}
            to={3}
            at={Math.round(0.9 * fps)}
            tone="amber"
          />
        </div>
        <div className="relative flex h-[128px] items-center justify-center">
          <Interactive.Div
            name="Item docks into the list"
            style={{
              opacity: enterAt(frame, fps, 0.1, 0.35),
              translate: interpolate(
                frame,
                [0.1 * fps, 0.85 * fps],
                ["-560px 0px", "0px 0px"],
                { easing: EASE_EXPO, ...clamp },
              ),
            }}
          >
            <ItemCard frame={frame} weld={enterAt(frame, fps, 1.7, 0.35)} />
          </Interactive.Div>
        </div>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex h-14 items-center rounded-xl border border-border-subtle/60 bg-raised/40 px-6"
            style={{ opacity: enterAt(frame, fps, 0.6 + i * 0.18, 0.5) }}
          >
            <span className="font-mono text-lg text-muted-foreground">
              {i === 0 ? "$BONK · 3fQe…r8tK" : "$JUP · aD4m…9pLz"}
            </span>
          </div>
        ))}
      </Interactive.Div>
    </Beat>
  );
};

/** 02 · pending — the window runs down in public; a strike circles but never lands. */
const PendingBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const consumed = interpolate(
    frame,
    [0.4 * fps, 4.4 * fps],
    [0, 1],
    { easing: Easing.linear, ...clamp },
  );
  const days = 5 - Math.floor(consumed * 5 + 0.0001);
  const telegraphOp = interpolate(
    frame,
    [1.1 * fps, 1.35 * fps, 3.3 * fps, 3.7 * fps],
    [0, 1, 1, 0],
    { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
  ) * (0.65 + 0.35 * Math.sin(frame / 2.4));
  return (
    <Beat
      copy={"the window is public —\nanyone can strike."}
      copyClass="text-5xl whitespace-pre-line text-center"
      sub="listing_window · 5 days"
    >
      <div className="relative" style={{ width: ITEM_W, height: ITEM_H, scale: "1.5 1.5" }}>
        <ItemCard frame={frame} />
        <WindowArc consumed={consumed} />
        <Interactive.Div
          name="Days left chip"
          className="absolute -top-14 left-1/2 -translate-x-1/2"
          style={{ opacity: enterAt(frame, fps, 0.3, 0.4) }}
        >
          <MonoChip tone="amber" className="bg-raised px-4 py-2 text-lg">
            window · {days}d
          </MonoChip>
        </Interactive.Div>
        <Interactive.Div
          name="Strike telegraph — does not land"
          className="absolute right-0 -top-6"
          style={{
            opacity: telegraphOp,
            translate: interpolate(
              frame,
              [1.1 * fps, 1.7 * fps, 3.3 * fps, 3.8 * fps],
              ["420px -160px", "150px -64px", "150px -64px", "470px -180px"],
              { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
            ),
          }}
        >
          <MonoChip tone="slash" className="bg-raised px-5 py-2.5 text-xl">
            challenge_item()
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** 03 · listed — the arc closes, the state is earned; a strike lands anyway. The card absorbs it. */
const ListedBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const impact = 2.4;
  const flash = interpolate(
    frame,
    [impact * fps, (impact + 0.45) * fps],
    [1, 0],
    { easing: Easing.linear, ...clamp },
  ) * (frame >= impact * fps ? 1 : 0);
  return (
    <Beat copy="listed ≠ final." sub="re-challengeable. forever.">
      <div className="flex flex-col items-center gap-12" style={{ scale: "1.45 1.45" }}>
        <Interactive.Div
          name="Item absorbs the strike"
          style={{
            translate: interpolate(
              frame,
              [impact * fps, (impact + 0.15) * fps, (impact + 0.35) * fps],
              ["0px 0px", "12px 0px", "0px 0px"],
              { easing: [EASE_EXPO, EASE_EXPO], ...clamp },
            ),
          }}
        >
          <div className="relative" style={{ width: ITEM_W, height: ITEM_H }}>
            <ItemCard frame={frame} />
            <WindowArc
              consumed={interpolate(frame, [0, 0.25 * fps], [0.08, 0], {
                easing: Easing.linear,
                ...clamp,
              })}
              opacity={interpolate(
                frame,
                [0.35 * fps, 0.9 * fps],
                [1, 0],
                { easing: EASE_EXPO, ...clamp },
              )}
            />
            {flash > 0 ? (
              <div
                className="pointer-events-none absolute -inset-[2px] rounded-[14px] border-2 border-slash"
                style={{ opacity: flash }}
              />
            ) : null}
            <Interactive.Div
              name="Strike lands and shatters"
              className="absolute right-0 -top-6"
              style={{
                opacity: interpolate(
                  frame,
                  [1.9 * fps, 2.3 * fps, impact * fps, (impact + 0.4) * fps],
                  [0, 1, 1, 0],
                  { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
                ),
                translate: interpolate(
                  frame,
                  [1.9 * fps, 2.4 * fps],
                  ["430px -180px", "36px -10px"],
                  { easing: EASE_EXPO, ...clamp },
                ),
                scale: interpolate(
                  frame,
                  [impact * fps, (impact + 0.4) * fps],
                  ["1 1", "0.6 0.6"],
                  { easing: EASE_EXPO, ...clamp },
                ),
              }}
            >
              <MonoChip tone="slash" className="bg-raised px-5 py-2.5 text-xl">
                challenge_item()
              </MonoChip>
            </Interactive.Div>
          </div>
        </Interactive.Div>
        <Interactive.Div
          name="Still listed chip"
          style={{ opacity: enterAt(frame, fps, 3.3, 0.4) }}
        >
          <MonoChip tone="confirm" className="bg-raised px-4 py-2 text-lg">
            still listed
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

/** 04 · exit — the only exit descends into a timelock; the window re-arms over it. */
const ExitBeat: FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Beat copy="the only exit is still on trial." sub="withdrawal · timelocked · challengeable">
      <div className="flex flex-col items-center gap-9">
        <Interactive.Div
          name="Withdrawal lock frame"
          className="flex w-[680px] flex-col gap-4 rounded-2xl border border-border-subtle bg-raised/30 p-6"
          style={{ opacity: enterAt(frame, fps, 0.1, 0.5), scale: "1.5 1.5" }}
        >
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-xl text-text-secondary">withdrawal</span>
            <MonoChip
              tone="amber"
              className="bg-raised px-4 py-1.5 text-base"
              style={{ opacity: enterAt(frame, fps, 1.3, 0.4) }}
            >
              timelock · 5d
            </MonoChip>
          </div>
          <div className="relative flex h-[128px] items-center justify-center">
            <Interactive.Div
              name="Item descends into the lock"
              style={{
                translate: interpolate(
                  frame,
                  [0.25 * fps, 1.05 * fps],
                  ["0px -170px", "0px 0px"],
                  { easing: EASE_EXPO, ...clamp },
                ),
              }}
            >
              <div className="relative" style={{ width: ITEM_W, height: ITEM_H }}>
                <ItemCard frame={frame} />
                <WindowArc
                  consumed={interpolate(
                    frame,
                    [1.35 * fps, 5.3 * fps],
                    [0, 0.22],
                    { easing: Easing.linear, ...clamp },
                  )}
                  opacity={enterAt(frame, fps, 1.35, 0.35)}
                />
              </div>
            </Interactive.Div>
          </div>
        </Interactive.Div>
        <Interactive.Div
          name="Withdraw instruction chip"
          style={{ opacity: enterAt(frame, fps, 1.7, 0.4) }}
        >
          <MonoChip tone="neutral" className="px-4 py-2 text-lg">
            request_withdrawal()
          </MonoChip>
        </Interactive.Div>
      </div>
    </Beat>
  );
};

const BEAT_SCENES: Record<(typeof BEATS)[number]["key"], FC> = {
  submit: SubmitBeat,
  pending: PendingBeat,
  listed: ListedBeat,
  exit: ExitBeat,
};

/**
 * The lifecycle spine — the episode's persistent state rail. Each node
 * ignites as the item reaches it; REMOVED never ignites (the exit is
 * still on trial when the film cuts). Mechanism-local frames.
 */
const SPINE = [
  { label: "PENDING", at: 8, activeAt: 66, settleAt: 315 },
  { label: "LISTED", at: 16, activeAt: 315, settleAt: 385 },
  { label: "WITHDRAW-PENDING", at: 24, activeAt: 495 },
  { label: "REMOVED", at: 32 },
] as const;

/**
 * S2 · MECHANISM — the item lifecycle, one beat per state. The StepRail
 * up top tracks the walkthrough; the StateNode spine beneath it is the
 * lifecycle itself. Each beat remounts via its own Sequence so local
 * frame timings stay simple. One Backdrop runs behind all beats.
 */
export function MechanismScene() {
  const frame = useCurrentFrame();
  const starts = BEATS.reduce<number[]>(
    (acc, beat, i) => [...acc, (acc[i - 1] ?? 0) + (BEATS[i - 1]?.frames ?? 0)],
    [],
  );

  return (
    <Scene seed="canon-item-mechanism">
      <div className="relative flex h-full flex-col p-16">
        <StepRail steps={BEATS.map(({ frames, label }) => ({ frames, label }))} />
        <div className="mt-6 flex items-center justify-center gap-3">
          {SPINE.map((node, i) => (
            <div key={node.label} className="flex items-center gap-3">
              {i > 0 ? <div className="h-[2px] w-8 bg-border-subtle" /> : null}
              <StateNode
                frame={frame}
                label={node.label}
                at={node.at}
                activeAt={"activeAt" in node ? node.activeAt : undefined}
                settleAt={"settleAt" in node ? node.settleAt : undefined}
                className="text-base"
              />
            </div>
          ))}
        </div>
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
