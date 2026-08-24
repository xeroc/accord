import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";
import { seededRandom } from "../internal/prng";
import { RulingStamp } from "./ruling-stamp";

/**
 * RetroBeam — "the final ruling reaches back": a horizontal round rail
 * where each round's votes start out colored by option (YES amber, NO
 * grey); the final ruling stamps into its slot at the right, then a
 * beam sweeps right→left (decelerating into the earliest round) and
 * the dots recolor AS THE BEAM PASSES — coherent-with-final → confirm,
 * against → slash — popping once at the beam's edge. Once a round is
 * fully passed, its slashed jurors' stake moves to the coherent ones:
 * each slashed dot emits a stake particle that arcs to a coherent
 * juror of the same round (the slashed dot shrinks and dims; the
 * receiver pops and stays grown). Dot placement is seeded
 * (`seededRandom`, byte-identical to Remotion's `random()`), keyed by
 * round id. Pure function of `frame`.
 */

/** Local geometry — the component's own coordinate frame (a 1300x370
 * band: dots above the rail, slot at the right, beam spanning full
 * height). The D4 scene placed this box at canvas (260, 250). */
const RAIL_Y = 320;
const SLOT_W = 190;
const SLOT_H = 86;
const FIRST_CENTER = 200;
/** px of clearance between the last round's dots and the slot. */
const SLOT_CLEAR = 300;

/** Deterministic dot placement — VRF-style jitter, re-seedable. */
function dotPositions(center: number, count: number, seed: string): { x: number; y: number }[] {
  const cols = count <= 3 ? 3 : count <= 7 ? 4 : 8;
  return Array.from({ length: count }, (_, i) => ({
    x: center + ((i % cols) - (cols - 1) / 2) * 27 + (seededRandom(`${seed}:${i}:x`) - 0.5) * 9,
    y: RAIL_Y - 118 + Math.floor(i / cols) * 27 + (seededRandom(`${seed}:${i}:y`) - 0.5) * 9,
  }));
}

export type RetroBeamRound = {
  /** round label — also the dot-jitter seed ("R1", "R2", …) */
  id?: string;
  yes: number;
  no: number;
};

/** Stake redistribution across one round: who pays, who receives. */
type Transfer = {
  /** emitting (slashed) dot index within the round */
  from: number;
  /** receiving (coherent) dot index within the round */
  to: number;
  /** particle departure frame */
  at: number;
};

export const RetroBeam: FC<{
  frame: number;
  /** rounds left→right; votes per round (yes = amber side) */
  rounds: readonly RetroBeamRound[];
  /** dispute.final_ruling — what coherence is judged against */
  finalRuling: "yes" | "no";
  /** frame the rail draws in (default 0) */
  at?: number;
  /** frame the beam departs the slot (default 66) */
  beamFrom?: number;
  /** frame the beam clears the last round (default 126) */
  beamTo?: number;
  /** frame the ruling stamps into the slot (default 46) */
  rulingAt?: number;
  /** frame the slot enters (default 30) */
  slotAt?: number;
  /** x center per round (component-local px); default even spacing */
  centers?: readonly number[];
  /** show the slashed→coherent stake redistribution (default true) */
  redistribute?: boolean;
  /** the bribed emphasis — larger dots, bigger pass pop (D4: R1 yes) */
  spotlight?: { round: number; side: "yes" | "no" };
  width?: number;
  height?: number;
  className?: string;
}> = ({
  frame,
  rounds,
  finalRuling,
  at = 0,
  beamFrom = 66,
  beamTo = 126,
  rulingAt = 46,
  slotAt = 30,
  centers,
  redistribute = true,
  spotlight,
  width = 1300,
  height = 370,
  className,
}) => {
  const last = rounds.length - 1;
  const slotX = width - 260;
  const xs = centers ?? rounds.map((_, i) =>
    rounds.length <= 1 ? FIRST_CENTER : FIRST_CENTER + (i * (slotX - SLOT_CLEAR - FIRST_CENTER)) / last,
  );
  const beamX0 = slotX - 60;
  const beamX1 = (xs[0] ?? FIRST_CENTER) - 50;

  const pulseDown = tween(frame, [beamTo + 30, beamTo + 36], [1, 0.92]);
  const pulseUp = tween(frame, [beamTo + 36, beamTo + 42], [0.92, 1]);
  const railPulse = frame < beamTo + 36 ? pulseDown : pulseUp;

  // the beam — decelerating into the earliest round
  const beamX = (f: number) => tween(f, [beamFrom, beamTo], [beamX0, beamX1], easeExpo);
  const bx = beamX(frame);
  const beamOp =
    tween(frame, [beamFrom - 4, beamFrom], [0, 1]) *
    tween(frame, [beamTo - 4, beamTo + 4], [1, 0]);

  /** Frame at which the beam's edge crosses x (recolors ride the beam). */
  const passFrame = (x: number) => {
    for (let f = beamFrom; f <= beamTo; f++) {
      if (beamX(f) <= x) {
        return f;
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  return (
    <div className={cn("relative", className)} style={{ width, height }}>
      {/* the rail */}
      <div
        data-rail
        className="absolute rounded-full bg-border-subtle"
        style={{
          left: 0,
          top: RAIL_Y,
          width,
          height: 2,
          transform: `scaleX(${tween(frame, [at, at + 19], [0, 1], easeExpo)})`,
          transformOrigin: "left center",
          opacity: railPulse,
        }}
      />

      {/* round columns */}
      {rounds.map((r, ri) => {
        const count = r.yes + r.no;
        const dots = dotPositions(xs[ri] ?? FIRST_CENTER, count, `d4-${r.id ?? ri}`);
        // redistribution: slashed dots pay coherent dots of the same round,
        // starting once the beam has fully passed the round's last dot
        const roundPassedAt = dots.reduce((m, d) => Math.min(m, passFrame(d.x)), Infinity);
        const giveAt = Number.isFinite(roundPassedAt) ? roundPassedAt + 4 : Infinity;
        const slashed: number[] = [];
        const coherent: number[] = [];
        dots.forEach((_, i) => {
          const vote = i < r.yes ? "yes" : "no";
          if (vote === finalRuling) {
            coherent.push(i);
          } else {
            slashed.push(i);
          }
        });
        const transfers: Transfer[] =
          redistribute && coherent.length > 0
            ? slashed.map((from, k) => ({ from, to: coherent[k % coherent.length] ?? 0, at: giveAt + k * 3 }))
            : [];
        const arriveAt = (t: Transfer) => t.at + 10;

        return (
          <div key={r.id ?? ri} data-round={ri}>
            {dots.map((d, i) => {
              const vote = i < r.yes ? "yes" : "no";
              const pass = passFrame(d.x);
              const passed = frame >= pass;
              const popT = tween(frame, [pass, pass + 4], [0, 1], linear);
              const spot = spotlight?.round === ri && spotlight.side === vote;
              // stake redistribution reshapes the dots after the beam
              const gives = transfers.filter((t) => t.from === i);
              const givesAt = gives[0]?.at ?? Infinity;
              const takes = transfers.filter((t) => t.to === i);
              const tookAt = takes.reduce((m, t) => Math.max(m, arriveAt(t)), -Infinity);
              const shrink = tween(frame, [givesAt, givesAt + 12], [1, 0.55], easeExpo);
              const dim = tween(frame, [givesAt, givesAt + 12], [1, 0.45], linear);
              const grow = tween(frame, [tookAt, tookAt + 8], [1, 1.22], easeExpo);
              const scale = (passed
                ? tween(popT, [0, 1], [spot ? 1.25 : 1.15, 1], linear)
                : 1) * (Number.isFinite(givesAt) ? shrink : 1) * (takes.length > 0 ? grow : 1);
              const local = vote === "yes" ? "bg-amber" : "bg-nearwhite/25";
              const recolored = vote === finalRuling ? "bg-confirm" : "bg-slash";
              const enter = 8 + ri * 12 + Math.floor((i * 6) / count);
              return (
                <div
                  key={i}
                  data-dot
                  data-vote={vote}
                  data-passed={passed ? "true" : "false"}
                  className={`absolute rounded-full ${passed ? recolored : local}`}
                  style={{
                    left: d.x,
                    top: d.y,
                    translate: "-50% -50%",
                    width: spot ? 16 : 14,
                    height: spot ? 16 : 14,
                    transform: `scale(${scale})`,
                    opacity: tween(frame, [enter, enter + 3], [0, 1], easeExpo) *
                      (Number.isFinite(givesAt) ? dim : 1),
                  }}
                />
              );
            })}

            {/* stake particles — slashed → coherent, within the round */}
            {transfers.map((t, k) => {
              const from = dots[t.from];
              const to = dots[t.to];
              if (!from || !to) {
                return null;
              }
              const flight = tween(frame, [t.at, arriveAt(t)], [0, 1], easeExpo);
              if (flight <= 0 || flight >= 1) {
                return null;
              }
              const px = from.x + (to.x - from.x) * flight;
              const arc = -Math.sin(Math.PI * flight) * 30;
              const py = from.y + (to.y - from.y) * flight + arc;
              return (
                <div
                  key={`p${k}`}
                  data-particle={`${ri}.${k}`}
                  className="absolute rounded-full border border-nearwhite/60 bg-nearwhite"
                  style={{
                    left: px,
                    top: py,
                    translate: "-50% -50%",
                    width: 6,
                    height: 6,
                    boxShadow: "0 0 8px var(--accord-nearwhite, #e6edf3)",
                  }}
                />
              );
            })}
          </div>
        );
      })}

      {/* the final_ruling slot */}
      <div
        data-slot
        className="absolute flex flex-col items-center gap-3"
        style={{
          left: slotX,
          top: RAIL_Y - 85,
          translate: "-50% -50%",
          opacity: tween(frame, [slotAt, slotAt + 8], [0, 1], easeExpo),
        }}
      >
        <span className="font-mono text-xs text-text-secondary">dispute.final_ruling</span>
        <div
          className={`flex items-center justify-center rounded-lg border-2 bg-raised/40 ${
            frame >= beamFrom - 10 ? "border-amber/60" : "border-dashed border-border-subtle"
          }`}
          style={{ width: SLOT_W, height: SLOT_H }}
        >
          <RulingStamp
            frame={frame}
            text={finalRuling === "yes" ? "YES" : "NO"}
            at={rulingAt}
            size="md"
          />
        </div>
      </div>

      {/* the retro-beam — right to left, trailing gradient behind */}
      <div
        data-beam
        className="pointer-events-none absolute"
        style={{ top: 0, bottom: 0, left: bx, opacity: beamOp }}
      >
        <div className="absolute left-0 top-0 h-full w-[120px] bg-gradient-to-r from-amber/20 to-transparent" />
        <div
          className="h-full w-[3px] bg-amber"
          style={{ boxShadow: "0 0 18px var(--accord-amber)" }}
        />
      </div>
    </div>
  );
};
