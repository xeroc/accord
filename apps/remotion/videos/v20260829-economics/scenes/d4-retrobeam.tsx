import type { FC } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { Scene } from "../../../src/shell/scene";
import { LedgerCounter, MonoChip, RulingStamp, TallyBar } from "@useaccord/ui";

import { ConceptChrome } from "./pieces";
import { multiTick } from "./timeline";

/**
 * D4 · Final-ruling retroactive coherence — a horizontal round
 * timeline. Rounds R1–R3 lay out colored by option (YES warm amber —
 * the TallyBar twin, NO neutral grey); the final ruling stamps
 * passes green/red against the FINAL ruling (R1's bribed majority
 * flips amber→red with the largest pop). Settle cranks then walk
 * forward, releasing each round's active_draws and landing the D2-
 * convention ledger annotations (numbers only — no transfers, no
 * vault outflows). Recolors are driven by the beam's position, never
 * by independent delays.
 */

const FINAL = "no"; // dispute.final_ruling
const RAIL_Y = 570;

const ROUNDS: readonly {
  id: string;
  center: number;
  yes: number;
  no: number;
  drawsAt: number;
  crankAt: number;
  chipAt: number;
}[] = [
  { id: "R1", center: 460, yes: 2, no: 1, drawsAt: 134, crankAt: 130, chipAt: 137 },
  { id: "R2", center: 740, yes: 2, no: 5, drawsAt: 156, crankAt: 152, chipAt: 159 },
  { id: "R3", center: 1020, yes: 6, no: 9, drawsAt: 176, crankAt: 172, chipAt: 179 },
];

const SLOT_X = 1300;
const BEAM_FROM = 66;
const BEAM_TO = 126;
const BEAM_X0 = 1260;
const BEAM_X1 = 410;

/** Beam position — decelerating into R1 (the earliest round gets the
 * slowest, most damning reveal). */
function beamX(f: number): number {
  return interpolate(f, [BEAM_FROM, BEAM_TO], [BEAM_X0, BEAM_X1], {
    easing: EASE_EXPO,
    ...clamp,
  });
}

/** Frame at which the beam's edge crosses x (recolors ride the beam). */
function passFrame(x: number): number {
  for (let f = BEAM_FROM; f <= BEAM_TO; f++) {
    if (beamX(f) <= x) {
      return f;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Deterministic dot placement — VRF-style jitter, re-seedable. */
function dotPositions(center: number, count: number, seed: string): { x: number; y: number }[] {
  const cols = count <= 3 ? 3 : count <= 7 ? 4 : 8;
  return Array.from({ length: count }, (_, i) => ({
    x: center + ((i % cols) - (cols - 1) / 2) * 27 + (random(`${seed}:${i}:x`) - 0.5) * 9,
    y: 452 + Math.floor(i / cols) * 27 + (random(`${seed}:${i}:y`) - 0.5) * 9,
  }));
}

/** Crank — the settle_round token. Rotation steps 90° per stop. */
const Crank: FC<{ x: number; y: number; rot: number; op: number }> = ({ x, y, rot, op }) => (
  <div
    className="absolute flex flex-col items-center gap-1"
    style={{ left: x, top: y, translate: "-50% -50%", opacity: op }}
  >
    <div className="relative h-8 w-8 rounded-full border-2 border-amber/70 bg-raised">
      <div
        className="absolute left-1/2 top-1/2 h-1 w-4 rounded-full bg-amber"
        style={{ transform: `translateY(-50%) rotate(${rot}deg)`, transformOrigin: "left center" }}
      />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber" />
    </div>
    <span className="font-mono text-[10px] tracking-widest text-muted-foreground">settle</span>
  </div>
);

export function D4RetroBeamScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const railDraw = interpolate(frame, [0, 19], [0, 1], { easing: EASE_EXPO, ...clamp });
  const railPulse = interpolate(frame, [196, 202, 208], [1, 0.92, 1], clamp);

  // the beam
  const bx = beamX(frame);
  const beamOp =
    interpolate(frame, [BEAM_FROM - 4, BEAM_FROM], [0, 1], clamp) *
    interpolate(frame, [BEAM_TO - 4, BEAM_TO + 4], [1, 0], clamp);

  const crankX = interpolate(
    frame,
    [114, 122, 133, 141, 150, 158, 170],
    [340, 460, 460, 740, 740, 1020, 1020],
    clamp,
  );
  const crankRot =
    interpolate(frame, [130, 137], [0, 90], { easing: EASE_EXPO, ...clamp }) +
    interpolate(frame, [152, 159], [0, 90], { easing: EASE_EXPO, ...clamp }) +
    interpolate(frame, [172, 179], [0, 90], { easing: EASE_EXPO, ...clamp });
  const crankOp =
    enterAt(frame, fps, 114 / fps, 4 / fps) *
    interpolate(frame, [184, 192], [1, 0], clamp);

  return (
    <Scene seed="econ-d4">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={3}
        headline="the final ruling reaches back"
        sub="coherence is judged against dispute.final_ruling — no round escapes the settle"
      />

      {/* the rail */}
      <div
        className="absolute rounded-full bg-border-subtle"
        style={{
          left: 260,
          top: RAIL_Y,
          width: 1300,
          height: 2,
          transform: `scaleX(${railDraw})`,
          transformOrigin: "left center",
          opacity: railPulse,
        }}
      />

      {/* round columns */}
      {ROUNDS.map((r, ri) => {
        const count = r.yes + r.no;
        const dots = dotPositions(r.center, count, `d4-${r.id}`);
        return (
          <div key={r.id}>
            {/* active_draws */}
            <div
              className="absolute"
              style={{ left: r.center, top: 352, translate: "-50% -50%", opacity: enterAt(frame, fps, (16 + ri * 12) / fps, 6 / fps) }}
            >
              <LedgerCounter
                frame={frame}
                label={`${r.id} active_draws`}
                {...multiTick(frame, count, [{ at: r.drawsAt, to: 0 }])}
                tone={frame >= r.drawsAt ? "confirm" : "neutral"}
              />
            </div>

            {/* the dots — round-local color until the beam passes */}
            {dots.map((d, i) => {
              const vote = i < r.yes ? "yes" : "no";
              const pass = passFrame(d.x);
              const passed = frame >= pass;
              const popT = interpolate(frame, [pass, pass + 4], [0, 1], clamp);
              const bribed = r.id === "R1" && vote === "yes";
              const scale = passed
                ? interpolate(popT, [0, 1], [bribed ? 1.25 : 1.15, 1])
                : 1;
              const local = vote === "yes" ? "bg-amber" : "bg-nearwhite/25";
              const recolored = vote === FINAL ? "bg-confirm" : "bg-slash";
              return (
                <div
                  key={i}
                  className={`absolute rounded-full ${passed ? recolored : local}`}
                  style={{
                    left: d.x,
                    top: d.y,
                    translate: "-50% -50%",
                    width: bribed ? 16 : 14,
                    height: bribed ? 16 : 14,
                    transform: `scale(${scale})`,
                    opacity: enterAt(frame, fps, (8 + ri * 12 + Math.floor((i * 6) / count)) / fps, 3 / fps),
                  }}
                />
              );
            })}

            {/* round-local tally (the record of what each round once said) */}
            <div
              className="absolute"
              style={{ left: r.center, top: RAIL_Y + 30, translate: "-50% 0", opacity: enterAt(frame, fps, (ri * 12 + 6) / fps, 6 / fps) }}
            >
              <TallyBar frame={frame} yes={r.yes} no={r.no} at={14 + ri * 12} width={220} />
            </div>

            {/* settle chip + D2-convention annotations (numbers only) */}
            <div
              className="absolute flex items-center gap-2"
              style={{ left: r.center, top: 700, translate: "-50% 0", opacity: enterAt(frame, fps, (r.chipAt + 2) / fps, 6 / fps) }}
            >
              <MonoChip tone="neutral">settle_round ✓</MonoChip>
              <MonoChip tone="slash">staked −20 ×{voteCount(r, "yes")}</MonoChip>
              <MonoChip tone="confirm">fees +5 ×{voteCount(r, "no")}</MonoChip>
            </div>
          </div>
        );
      })}

      {/* the final_ruling slot */}
      <div
        className="absolute flex flex-col items-center gap-3"
        style={{ left: SLOT_X, top: 485, translate: "-50% -50%", opacity: enterAt(frame, fps, 30 / fps, 8 / fps) }}
      >
        <span className="font-mono text-xs text-text-secondary">dispute.final_ruling</span>
        <div
          className={`flex h-[86px] w-[190px] items-center justify-center rounded-lg border-2 bg-raised/40 ${
            frame >= 56 ? "border-amber/60" : "border-dashed border-border-subtle"
          }`}
        >
          <RulingStamp frame={frame} text="NO" at={46} size="md" />
        </div>
      </div>

      {/* the retro-beam — right to left, trailing gradient behind */}
      <div className="pointer-events-none absolute" style={{ top: 250, bottom: 460, left: bx, opacity: beamOp }}>
        <div
          className="absolute left-0 top-0 h-full w-[120px] bg-gradient-to-r from-amber/20 to-transparent"
        />
        <div
          className="h-full w-[3px] bg-amber"
          style={{ boxShadow: "0 0 18px var(--accord-amber)" }}
        />
      </div>

      {/* the settle crank */}
      <Crank x={crankX} y={RAIL_Y - 26} rot={crankRot} op={crankOp} />

      {/* finality seal */}
      <div
        className="absolute"
        style={{ left: SLOT_X, top: 640, translate: "-50% 0", opacity: enterAt(frame, fps, 202 / fps, 8 / fps) }}
      >
        <MonoChip tone="confirm">✓ settled · active_draws 0</MonoChip>
      </div>
    </Scene>
  );
}

/** How many of a round's votes went to `side`. */
function voteCount(r: { yes: number; no: number }, side: "yes" | "no"): number {
  return side === "yes" ? r.yes : r.no;
}
