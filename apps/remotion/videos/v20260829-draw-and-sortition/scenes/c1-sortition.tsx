import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { MonoChip, SortitionRuler } from "@useaccord/ui";
import { clamp, enterAt, exitAt, scramble } from "../../../src/shell/anim";
import { Coin } from "../../../src/pieces/coin";
import { Scene } from "../../../src/shell/scene";
import { BeatCopy, SceneChrome, expo } from "./chrome";
import {
  C1_LABELS,
  C1_R0,
  C1_R1,
  C1_R2,
  C1_RANGE,
  C1_STAKES,
  C1_TOTAL,
  T1,
} from "./timeline";

/**
 * C1Sortition — stake-weighted sortition, the number line.
 *
 * The ruler IS the pool: total_stake as [0, total), five stake-
 * proportional segments, one VRF dart. Kit SortitionRuler owns dart 1
 * (the pinned → thrown → landed lifecycle via two prop windows); darts
 * 2 and 3 are scene-local twins of the kit dart so the collision →
 * draw_attempt re-derivation can play while dart 1's mark persists.
 * The ruler never reshapes — that is the point of the scene.
 */

const RULER_W = 1000;
const RULER_X = (1920 - RULER_W) / 2;
const BASELINE_Y = 560;
/** stake units → px along the ruler (width == total, so 1:1 here). */
const stakeToX = (r: number) => (r / C1_TOTAL) * RULER_W;

/** Segment geometry, mirroring the kit's formula (2 px gaps). */
const SEG_GAP = 2;
const SEG_USABLE = RULER_W - SEG_GAP * (C1_STAKES.length - 1);
const SEG_W = C1_STAKES.map((s) => (s / C1_TOTAL) * SEG_USABLE);
const SEG_LEFT: number[] = [];
{
  let cursor = 0;
  for (const w of SEG_W) {
    SEG_LEFT.push(cursor);
    cursor += w + SEG_GAP;
  }
}

const HEX1 = "7f3a91c2";
const HEX2 = "b48d02e7";

/**
 * Dart — scene-local twin of the kit dart (same teardrop geometry,
 * arc, squash-settle and drop-needle) for the collision/re-derivation
 * throws the single-dart kit piece cannot hold alongside dart 1.
 * `dissolveAt` fades dart + needle out (the discarded attempt).
 */
function Dart({
  frame,
  from,
  to,
  throwAt,
  landAt,
  dissolveAt,
}: {
  frame: number;
  from: number;
  to: number;
  throwAt: number;
  landAt: number;
  dissolveAt?: number;
}) {
  if (frame < throwAt) {
    return null;
  }
  const flight = expo(frame, throwAt, landAt - throwAt);
  const settle = expo(frame, landAt, 4);
  const x = stakeToX(from + (to - from) * flight);
  const arcY = -Math.sin(Math.PI * flight) * 26;
  const out =
    dissolveAt !== undefined
      ? interpolate(frame, [dissolveAt, dissolveAt + 5], [1, 0], { ...clamp })
      : 1;
  const dartOp = out * interpolate(frame, [throwAt, throwAt + 4], [0, 1], { ...clamp });
  return (
    <>
      {frame >= landAt ? (
        <div
          className="absolute w-px bg-amber"
          style={{
            left: x,
            bottom: 0,
            height: 54,
            opacity: settle * out,
            boxShadow: "0 0 6px var(--accord-amber)",
          }}
        />
      ) : null}
      <div
        className="absolute"
        style={{
          left: x,
          bottom: 30 + arcY + 12,
          transform: `translate(-50%, 50%) scale(${0.97 + settle * 0.03}) rotate(${45 + (1 - flight) * 20}deg)`,
          opacity: dartOp,
        }}
      >
        <div
          className="h-[18px] w-[10px] rounded-t-full bg-amber"
          style={{
            clipPath: "polygon(50% 100%, 0 22%, 0 0, 100% 0, 100% 22%)",
            boxShadow: "0 0 10px var(--accord-amber)",
          }}
        />
      </div>
    </>
  );
}

function Seat({
  frame,
  fps,
  left,
  name,
  juror,
  claimAt,
}: {
  frame: number;
  fps: number;
  left: number;
  name: string;
  juror: string;
  claimAt: number;
}) {
  const e = enterAt(frame, fps, T1.seatsAt / 30, 0.5);
  const claimed = frame >= claimAt;
  const pop = enterAt(frame, fps, claimAt / 30, 0.35);
  return (
    <div
      className={`absolute flex h-14 w-44 items-center justify-center rounded-lg border font-mono text-lg ${
        claimed
          ? "border-amber/60 bg-amber/10 text-amber"
          : "border-border-subtle bg-raised/50 text-muted-foreground"
      }`}
      style={{ left, top: 656, opacity: e }}
    >
      {claimed ? (
        <span style={{ transform: `scale(${0.8 + 0.2 * pop})` }}>{juror} · juror</span>
      ) : (
        name
      )}
    </div>
  );
}

export function C1Sortition() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- kit ruler prop windows -------------------------------------------
  // W1 (pre-throw): dart pinned at the r=0 end. W2 (post-throw): the
  // same dart flies 0 → r₀ — continuity holds because both windows put
  // the dart at x=0 on the switch frame. W3 (seat 2): the winner tint
  // moves to S; R keeps its hatch (drawn — excluded).
  const thrown1 = frame >= T1.throw1;
  const seat2 = frame >= T1.win2;

  const hexTarget = frame >= T1.reflick ? HEX2 : HEX1;
  const hexLocked =
    (frame >= T1.hexLock1 && frame < T1.reflick) || frame >= T1.hexLock2;
  const attempt = Math.round(
    interpolate(frame, [T1.attemptTick, T1.attemptTick + 5], [0, 1], { ...clamp }),
  );

  const [r0lo, r0hi] = C1_RANGE[2] ?? [0, 0];
  const [r1lo, r1hi] = C1_RANGE[3] ?? [0, 0];

  return (
    <Scene seed="draw-sortition-c1">
      <SceneChrome active={0} frames={330} />

      {/* VRF handoff cluster */}
      <div
        className="absolute flex items-center gap-4"
        style={{ left: 560, top: 388, opacity: enterAt(frame, fps, T1.vrfChipAt / 30, 0.4) }}
      >
        <MonoChip tone="amber">committed_vrf</MonoChip>
        <span className="font-mono text-lg tracking-wider text-nearwhite">
          {scramble("c1-vrf", frame, hexTarget, hexLocked)}
        </span>
      </div>
      <p
        className="absolute font-mono text-sm text-text-secondary"
        style={{ left: 560, top: 432, opacity: enterAt(frame, fps, T1.capR0At / 30, 0.35) }}
      >
        r₀ = vrf % total_stake
      </p>
      <p
        className="absolute font-mono text-sm text-text-secondary"
        style={{ left: 560, top: 456, opacity: enterAt(frame, fps, T1.capR1At / 30, 0.35) }}
      >
        r₁ = hash(vrf, draw_attempt) % total_stake
      </p>

      {/* draw_attempt odometer (ticks 0 → 1 on collision) */}
      <div
        className="absolute"
        style={{ left: 1042, top: 440, opacity: enterAt(frame, fps, T1.flash2 / 30, 0.3) }}
      >
        <MonoChip tone="amber">draw_attempt {attempt}</MonoChip>
      </div>

      {/* the ruler — one kit piece, everything anchored to its baseline */}
      <div className="absolute" style={{ left: RULER_X, top: BASELINE_Y, width: RULER_W }}>
        <SortitionRuler
          frame={frame}
          stakes={C1_STAKES}
          labels={C1_LABELS}
          at={T1.at}
          sweepAt={T1.sweepAt}
          dartR={thrown1 ? C1_R0 : 0}
          dartAt={thrown1 ? T1.land1 : 9999}
          throwFrom={thrown1 ? 0 : undefined}
          throwAt={thrown1 ? T1.throw1 : T1.dartPin}
          winner={seat2 ? 3 : 2}
          winAt={seat2 ? T1.win2 : T1.win1}
          drawn={[2]}
          drawnAt={T1.hatchR}
          width={RULER_W}
        />

        {/* dart 2 — the collision (compressed repeat, lands in drawn R) */}
        <Dart frame={frame} from={0} to={C1_R2} throwAt={T1.throw2} landAt={T1.land2} dissolveAt={T1.dissolve2} />
        {/* dart 3 — the re-derived r₁ (lands in S) */}
        <Dart frame={frame} from={0} to={C1_R1} throwAt={T1.throw3} landAt={T1.land3} />

        {/* one flat amber flash on collision — firm, no shake */}
        {frame >= T1.flash2 ? (
          <div
            className="absolute rounded-md border border-amber bg-amber/15"
            style={{
              left: stakeToX(C1_R2) - 70,
              bottom: -8,
              width: 140,
              height: 46,
              opacity: interpolate(frame, [T1.flash2, T1.flash2 + 5], [1, 0], { ...clamp }),
            }}
          />
        ) : null}

        {/* tags + prefix math (kit coordinates: bottom = baseline) */}
        <div
          className="absolute"
          style={{
            left: stakeToX(C1_R2) + 14,
            bottom: 74,
            opacity: enterAt(frame, fps, T1.collisionTagAt / 30, 0.3),
          }}
        >
          <MonoChip tone="amber">collision — inside drawn(R)</MonoChip>
        </div>
        <div
          className="absolute"
          style={{ left: 425, bottom: 56, opacity: enterAt(frame, fps, T1.tagRAt / 30, 0.3) }}
        >
          <MonoChip tone="neutral">drawn — excluded</MonoChip>
        </div>
        <div
          className="absolute"
          style={{ left: 775, bottom: 56, opacity: enterAt(frame, fps, T1.tagSAt / 30, 0.3) }}
        >
          <MonoChip tone="neutral">drawn — excluded</MonoChip>
        </div>

        {/* S hatch — scene-local wipe (the kit hatches all drawn segments
            at one frame; S needs its own beat without re-wiping R) */}
        <div
          className="absolute rounded-t-sm"
          style={{
            left: SEG_LEFT[3] ?? 0,
            bottom: 0,
            width: SEG_W[3] ?? 0,
            height: 30,
            opacity: expo(frame, T1.hatchS, 8),
            background:
              "repeating-linear-gradient(45deg, transparent 0 3px, var(--accord-border) 3px 5px)",
          }}
        />

        {/* prefix-math captions under the winning ranges */}
        <p
          className="absolute font-mono text-sm text-text-secondary"
          style={{
            left: 425,
            bottom: -54,
            translate: "-50% 0",
            opacity:
              enterAt(frame, fps, T1.capPrefixRAt / 30, 0.35) *
              exitAt(frame, fps, T1.capPrefixROut / 30, 0.3),
          }}
        >
          {r0lo} ≤ r₀={C1_R0} &lt; {r0hi} → R
        </p>
        <p
          className="absolute font-mono text-sm text-text-secondary"
          style={{
            left: 775,
            bottom: -54,
            translate: "-50% 0",
            opacity:
              enterAt(frame, fps, T1.capPrefixSAt / 30, 0.35) *
              exitAt(frame, fps, T1.capPrefixSOut / 30, 0.3),
          }}
        >
          {r1lo} ≤ r₁={C1_R1} &lt; {r1hi} → S
        </p>
      </div>

      {/* seats — the hit resolves to exactly one seat each */}
      <Seat frame={frame} fps={fps} left={700} name="seat 1" juror="R" claimAt={T1.coin1At + 16} />
      <Seat frame={frame} fps={fps} left={1170} name="seat 2" juror="S" claimAt={T1.coin2At + 16} />

      {/* juror tokens arcing from the winning segments into the seats */}
      <Coin from={{ x: RULER_X + 425, y: 528 }} to={{ x: 788, y: 682 }} at={T1.coin1At} />
      <Coin from={{ x: RULER_X + 775, y: 528 }} to={{ x: 1258, y: 682 }} at={T1.coin2At} />

      <BeatCopy at={1.0} out={2.73} copy="Stake is a ruler" sub="[0, total_stake) — every juror's slice is proportional to their stake" />
      <BeatCopy at={3.23} out={4.9} copy="The dart is pure chance" sub="r = vrf % total_stake — nobody chose where it lands" />
      <BeatCopy at={5.23} out={6.53} copy="Drawn means excluded" sub="the winner leaves the pool — the ruler itself never reshapes" />
      <BeatCopy at={6.9} out={8.5} copy="Collisions re-derive, never re-roll" sub="r lands in a drawn range → draw_attempt++ re-derives r from the same seed" />
      <BeatCopy at={8.87} copy="Two seats, one honest ruler" sub="same fixed ruler, same committed VRF — minus the drawn" />
    </Scene>
  );
}
