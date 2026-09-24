import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { MonoChip, SortitionRuler } from "@useaccord/ui";
import { clamp, enterAt, exitAt, scramble } from "../../../src/shell/anim";
import { Coin } from "../../../src/pieces/coin";
import { Scene } from "../../../src/shell/scene";
import { BeatCopy, SceneChrome } from "./chrome";
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
 * proportional segments. The kit SortitionRuler plays the whole
 * story: dart 1 pinned → thrown → landed, the collision dart that
 * dissolves, the re-derived r₁, per-segment hatches and both winner
 * tints — via its multi-dart `darts`/`wins`/`hatches` props. The
 * ruler never reshapes — that is the point of the scene.
 */

const RULER_W = 1000;
const RULER_X = (1920 - RULER_W) / 2;
const BASELINE_Y = 560;
/** stake units → px along the ruler (width == total, so 1:1 here). */
const stakeToX = (r: number) => (r / C1_TOTAL) * RULER_W;

const HEX1 = "7f3a91c2";
const HEX2 = "b48d02e7";

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

  // --- VRF state (the hex scramble + draw_attempt odometer) --------------
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

      {/* the ruler — one kit piece; its box is 102 px tall with the
          baseline at the box bottom, so shift the wrapper up to keep
          the baseline at canvas BASELINE_Y. Everything else anchors
          bottom-relative to the baseline. */}
      <div className="absolute" style={{ left: RULER_X, top: BASELINE_Y - 102, width: RULER_W }}>
        <SortitionRuler
          frame={frame}
          stakes={C1_STAKES}
          labels={C1_LABELS}
          at={T1.at}
          sweepAt={T1.sweepAt}
          darts={[
            // dart 1 — pinned at r=0, thrown, lands inside R (the winner)
            { r: C1_R0, from: 0, pinAt: T1.dartPin, throwAt: T1.throw1, landAt: T1.land1 },
            // dart 2 — the collision (compressed repeat, lands in drawn R, dissolves)
            { r: C1_R2, from: 0, throwAt: T1.throw2, landAt: T1.land2, dissolveAt: T1.dissolve2 },
            // dart 3 — the re-derived r₁ (lands in S)
            { r: C1_R1, from: 0, throwAt: T1.throw3, landAt: T1.land3 },
          ]}
          wins={[
            { seg: 2, at: T1.win1 },
            { seg: 3, at: T1.win2 },
          ]}
          hatches={[
            { seg: 2, at: T1.hatchR },
            { seg: 3, at: T1.hatchS },
          ]}
          width={RULER_W}
        />

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
