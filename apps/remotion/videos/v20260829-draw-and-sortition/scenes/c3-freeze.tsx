import { Fragment } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { MerkleSumTree, MonoChip, StateNode } from "@useaccord/ui";
import { clamp, enterAt, exitAt, scramble } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { BeatCopy, SceneChrome, expo } from "./chrome";
import { T3 } from "./timeline";

/**
 * C3Freeze — VRF delivery + root freeze: the manipulation-proof timing.
 *
 * A sequence diagram: time flows L→R along a bottom axis, three
 * lifelines (cranker · Accord · MagicBlock oracle), the accumulator
 * root riding the Accord lifeline as a small MST glyph (quoting C2).
 * The hero beat is the freeze: `commit_vrf_callback` writes the
 * committed VRF and freezes the root in ONE instruction —
 *
 *   HARD RULE 1 (atomicity): the committed_vrf stamp (frame 114) and
 *   the freeze-line drop (frame 115) begin one frame apart — 33 ms,
 *   within the ≤80 ms budget. If they visibly stagger, the animation
 *   would falsely imply two separate writes.
 *   HARD RULE 2: the entropy glyph's rotation halts on the exact frame
 *   the line lands (127) — chance stops moving once committed.
 *
 * Then both attack windows fail (blind before, inert after) and the
 * escape hatch opens: a silent oracle stalls, any cranker cancels.
 */

const STAGE = { x0: 240, x1: 1680, y0: 200, y1: 880 };
const LANES = [
  { key: "cranker", y: 380 },
  { key: "accord", y: 520 },
  { key: "oracle", y: 660 },
] as const;
const ACTOR_X = 252;
const LINE_X0 = 380;
const X = { req: 480, entropy: 660, freeze: 940, seat0: 1020, dispute: 1420, silence: 1585 };

const LINE_TONE: Record<string, string> = {
  amber: "bg-amber",
  slash: "bg-slash/80",
  neutral: "bg-border-subtle",
};
const HEAD_TONE: Record<string, string> = {
  amber: "border-l-amber",
  slash: "border-l-slash/80",
  neutral: "border-l-border-subtle",
};

/** ActorChip — a lifeline's actor; optional press-squash when it pays. */
function ActorChip({
  frame,
  fps,
  lane,
  at,
  tone,
  label,
  pressAt,
}: {
  frame: number;
  fps: number;
  lane: number;
  at: number;
  tone: "amber" | "neutral";
  label: string;
  pressAt?: number;
}) {
  const e = enterAt(frame, fps, at / 30, 0.35);
  const press =
    pressAt !== undefined
      ? 1 - 0.03 * Math.sin(Math.PI * Math.min(1, Math.max(0, (frame - pressAt) / 6)))
      : 1;
  return (
    <div className="absolute" style={{ left: ACTOR_X, top: lane - 15, opacity: e, transform: `scale(${press})` }}>
      <MonoChip tone={tone} className="px-4 py-1.5 text-sm">
        {label}
      </MonoChip>
    </div>
  );
}

/** StraightArrow — an angular point-to-point arrow (attack lines are
 * straight: path-as-language). Draws on brand-eased from origin. */
function StraightArrow({
  frame,
  from,
  to,
  at,
  dur,
  tone = "amber",
}: {
  frame: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  at: number;
  dur: number;
  tone?: string;
}) {
  if (frame < at) {
    return null;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const draw = expo(frame, at, dur);
  return (
    <div className="absolute" style={{ left: from.x, top: from.y }}>
      <div
        className={`absolute h-[2px] origin-left ${LINE_TONE[tone] ?? LINE_TONE.amber}`}
        style={{ width: len, transform: `rotate(${ang}deg) scaleX(${draw})` }}
      />
      <div
        className={`absolute h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent ${HEAD_TONE[tone] ?? HEAD_TONE.amber}`}
        style={{ left: dx - 4, top: dy - 5, transform: `rotate(${ang}deg)`, opacity: draw > 0.96 ? 1 : 0 }}
      />
    </div>
  );
}

/** VMessage — a vertical sequence-diagram message (lane → lane) that
 * draws on with its instruction label beside it. */
function VMessage({
  frame,
  x,
  y0,
  y1,
  at,
  dur,
  label,
}: {
  frame: number;
  x: number;
  y0: number;
  y1: number;
  at: number;
  dur: number;
  label: string;
}) {
  if (frame < at) {
    return null;
  }
  const down = y1 > y0;
  const len = Math.abs(y1 - y0);
  const draw = expo(frame, at, dur);
  return (
    <div className="absolute" style={{ left: x, top: Math.min(y0, y1) }}>
      <div
        className="absolute w-[2px] bg-amber"
        style={{
          height: len,
          transform: `scaleY(${draw})`,
          transformOrigin: down ? "top" : "bottom",
        }}
      />
      <div
        className={`absolute h-0 w-0 border-x-[5px] border-y-[7px] border-x-transparent ${down ? "border-t-amber" : "border-b-amber"}`}
        style={{ left: -4, top: down ? len - 7 : -7, opacity: draw > 0.96 ? 1 : 0 }}
      />
      <span
        className="absolute whitespace-nowrap font-mono text-sm text-text-secondary"
        style={{
          left: 14,
          top: len * 0.32 - 10,
          opacity: interpolate(frame, [at + dur - 2, at + dur + 2], [0, 1], { ...clamp }),
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** FreezeLine — the hero: a glow charge during the callback's flight,
 * then the top→bottom drop (the family's rationed slow reveal). */
function FreezeLine({ frame }: { frame: number }) {
  const charge = interpolate(frame, [T3.glowCharge, T3.freezeDropAt], [0, 0.35], { ...clamp });
  const drop = expo(frame, T3.freezeDropAt, T3.freezeLandAt - T3.freezeDropAt);
  return (
    <div className="absolute" style={{ left: X.freeze, top: STAGE.y0, height: STAGE.y1 - STAGE.y0, width: 2 }}>
      {drop < 1 ? (
        <div
          className="absolute inset-y-0 left-1/2 w-[6px] -translate-x-1/2 bg-amber/20"
          style={{ opacity: charge }}
        />
      ) : null}
      <div
        className="absolute inset-y-0 left-0 w-[2px] origin-top bg-amber"
        style={{ transform: `scaleY(${drop})`, boxShadow: "0 0 16px var(--accord-amber)" }}
      />
    </div>
  );
}

/** EntropyGlyph — spins up and decelerates, drifts while uncommitted,
 * and halts DEAD on the frame the freeze line lands (hard rule 2:
 * t clamps at freezeLandAt, so rotation is constant after it). */
function EntropyGlyph({ frame, fps }: { frame: number; fps: number }) {
  const t = Math.min(frame, T3.freezeLandAt);
  const spin = interpolate(t, [T3.entropyAt, T3.entropyAt + 21], [0, 520], {
    easing: Easing.out(Easing.quad),
    ...clamp,
  });
  const drift = Math.max(0, t - (T3.entropyAt + 21)) * 2.2;
  return (
    <div
      className="absolute flex items-center justify-center"
      style={{ left: X.entropy, top: LANES[2].y, translate: "-50% -50%", opacity: enterAt(frame, fps, T3.entropyAt / 30, 0.3) }}
    >
      <div className="h-11 w-11 rounded-full border-2 border-dashed border-amber/60" style={{ rotate: `${spin + drift}deg` }} />
      <div className="absolute h-1.5 w-1.5 rounded-full bg-amber" />
    </div>
  );
}

/** MiniRuler — the C1 callback inside window A: the adversary reshapes
 * the ruler twice while the dart stays veiled (a `?` orb wandering
 * behind frosted glass, never landing). Reshaping is gambling. */
function MiniRuler({ frame, fps }: { frame: number; fps: number }) {
  const vecs = [
    [30, 22, 28, 20],
    [16, 36, 20, 28],
    [38, 14, 26, 22],
  ];
  const idx = frame >= T3.reshape2 ? 2 : frame >= T3.reshape1 ? 1 : 0;
  const start = idx === 0 ? T3.miniAt : idx === 1 ? T3.reshape1 : T3.reshape2;
  const mix = expo(frame, start, 8);
  const prev = vecs[Math.max(0, idx - 1)] ?? vecs[0]!;
  const cur = vecs[idx] ?? vecs[0]!;
  const sum = cur.reduce((s, v) => s + v, 0);
  const innerW = 320 - 3 * 2;
  const widths = cur.map((v, i) => ((prev[i]! + (v - prev[i]!) * mix) / sum) * innerW);
  const op =
    enterAt(frame, fps, T3.miniAt / 30, 0.2) * exitAt(frame, fps, T3.dissolveA / 30, 0.27);
  if (op <= 0) {
    return null;
  }
  const orbX = 157 + 90 * Math.sin(frame * 0.21) + 38 * Math.sin(frame * 0.077 + 2);
  const orbY = 10 + 7 * Math.sin(frame * 0.31);
  return (
    <div
      className="absolute rounded-md border border-border-subtle bg-raised/30 p-[6px]"
      style={{ left: 560, top: 292, width: 320 + 12, opacity: op }}
    >
      <div className="relative flex items-end gap-[2px]">
        {widths.map((w, i) => (
          <div
            key={i}
            className="h-5 rounded-t-sm border border-border-subtle bg-nearwhite/15"
            style={{ width: w }}
          />
        ))}
        {/* the veiled dart — chance-accent wander, never landing */}
        <div
          className="absolute flex h-5 w-5 items-center justify-center rounded-full border border-amber/60 font-mono text-xs text-amber"
          style={{ left: orbX, top: orbY }}
        >
          ?
        </div>
        {/* frosted glass over the whole line */}
        <div className="absolute inset-0 rounded-sm bg-background/30" />
      </div>
    </div>
  );
}

/** Bracket — a ⊓ over a time region, drawing L→R with hanging legs. */
function Bracket({
  frame,
  fps,
  x0,
  x1,
  y,
  at,
  label,
}: {
  frame: number;
  fps: number;
  x0: number;
  x1: number;
  y: number;
  at: number;
  label: string;
}) {
  if (frame < at) {
    return null;
  }
  const draw = expo(frame, at, 8);
  const legs = expo(frame, at + 4, 6);
  return (
    <div className="absolute" style={{ left: x0, top: y, width: x1 - x0 }}>
      <div className="absolute inset-x-6 top-0 h-px origin-left bg-border-subtle" style={{ transform: `scaleX(${draw})` }} />
      <div className="absolute left-6 top-0 h-3 w-px origin-top bg-border-subtle" style={{ transform: `scaleY(${legs})` }} />
      <div className="absolute right-6 top-0 h-3 w-px origin-top bg-border-subtle" style={{ transform: `scaleY(${legs})` }} />
      <div className="absolute inset-x-0 flex justify-center" style={{ top: -40, opacity: enterAt(frame, fps, (at + 6) / 30, 0.15) }}>
        <MonoChip tone="neutral">{label}</MonoChip>
      </div>
    </div>
  );
}

/** Ghost — the adversary token: descends into the frame, fires, leaves. */
function Ghost({
  frame,
  x,
  y0,
  y1,
  at,
  outAt,
}: {
  frame: number;
  x: number;
  y0: number;
  y1: number;
  at: number;
  outAt: number;
}) {
  if (frame < at || frame > outAt + 6) {
    return null;
  }
  const t = expo(frame, at, 10);
  const op = interpolate(frame, [at, at + 4, outAt, outAt + 6], [0, 1, 1, 0], { ...clamp });
  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{ left: x, top: y0 + (y1 - y0) * t, translate: "-50% -50%", opacity: op }}
    >
      <div className="h-4 w-4 rounded-full border border-border-subtle bg-raised/60" />
      <span className="font-mono text-xs text-muted-foreground">adversary</span>
    </div>
  );
}

/** DeflectedAttack — window B's arrow: travels, strikes the freeze
 * plane (one flat amber flash), slides 26 px down the glass on a curved
 * path and fades. The root does not move a pixel. */
function DeflectedAttack({ frame }: { frame: number }) {
  if (frame < T3.attackBAt) {
    return null;
  }
  const from = { x: 1538, y: 330 };
  const hit = { x: 968, y: 462 };
  const dx = hit.x - from.x;
  const dy = hit.y - from.y;
  const len = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
  const draw = expo(frame, T3.attackBAt, T3.hitB - T3.attackBAt);
  const slide = interpolate(frame, [T3.hitB, T3.hitB + 10], [0, 1], {
    easing: Easing.in(Easing.quad),
    ...clamp,
  });
  const fade = interpolate(frame, [T3.hitB + 3, T3.hitB + 10], [1, 0], { ...clamp });
  const flash = interpolate(frame, [T3.hitB, T3.hitB + 5], [1, 0], { ...clamp });
  return (
    <>
      <div
        className="absolute"
        style={{
          left: from.x,
          top: from.y,
          translate: `${10 * Math.sin(Math.PI * slide)}px ${26 * slide}px`,
          opacity: fade,
        }}
      >
        <div className="absolute h-[2px] origin-left bg-slash/80" style={{ width: len, transform: `rotate(${ang}deg) scaleX(${draw})` }} />
        <div
          className="absolute h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-slash/80"
          style={{ left: dx - 4, top: dy - 5, transform: `rotate(${ang}deg)`, opacity: draw > 0.96 ? 1 : 0 }}
        />
      </div>
      {frame >= T3.hitB ? (
        <div
          className="absolute rounded-full border border-amber bg-amber/20"
          style={{ left: hit.x - 32, top: hit.y - 32, width: 64, height: 64, opacity: flash }}
        />
      ) : null}
    </>
  );
}

export function C3Freeze() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const veiled = frame < T3.stampAt;
  const rValue = veiled ? "r = ??????" : `r = ${scramble("c3-r", frame, "0x7b2f", frame >= T3.stampAt + 6)}`;
  const stampP = expo(frame, T3.stampAt, 5);
  const stampFlash = interpolate(frame, [T3.stampAt, T3.stampAt + 5], [1, 0], { ...clamp });
  const tint = enterAt(frame, fps, T3.tintAt / 30, 0.2);
  const lockP = enterAt(frame, fps, T3.lockAt / 30, 0.2);
  const ringP = interpolate(frame, [T3.ringAt, T3.ringAt + 21], [0, 1], { ...clamp });

  return (
    <Scene seed="draw-sortition-c3">
      <SceneChrome active={2} frames={495} />

      {/* crystalline region right of the freeze line */}
      <div
        className="absolute"
        style={{
          left: X.freeze + 2,
          top: STAGE.y0,
          width: STAGE.x1 - X.freeze - 2,
          height: STAGE.y1 - STAGE.y0,
          opacity: tint * 0.6,
        }}
      >
        <div className="absolute inset-0 bg-nearwhite/5" />
        <div
          className="absolute inset-0"
          style={{
            background: "repeating-linear-gradient(135deg, transparent 0 9px, var(--accord-border) 9px 10px)",
            opacity: 0.25,
          }}
        />
      </div>

      {/* time axis + t₀ */}
      <div
        className="absolute h-px origin-left bg-border-subtle"
        style={{ left: STAGE.x0, top: 820, width: STAGE.x1 - STAGE.x0, transform: `scaleX(${expo(frame, T3.axisAt, 14)})` }}
      />
      <span
        className="absolute font-mono text-xs text-muted-foreground"
        style={{ left: STAGE.x0 - 8, top: 832, opacity: enterAt(frame, fps, T3.t0At / 30, 0.3) }}
      >
        t₀
      </span>
      <span
        className="absolute font-mono text-xs text-muted-foreground"
        style={{ left: STAGE.x1 - 64, top: 832, opacity: enterAt(frame, fps, T3.t0At / 30, 0.3) }}
      >
        time →
      </span>

      {/* lifelines + actors */}
      {LANES.map((lane, i) => (
        <div
          key={lane.key}
          className="absolute h-px origin-left bg-border-subtle"
          style={{ left: LINE_X0, top: lane.y, width: STAGE.x1 - LINE_X0, transform: `scaleX(${expo(frame, T3.laneAt + i * 4, 12)})` }}
        />
      ))}
      <ActorChip frame={frame} fps={fps} lane={LANES[0].y} at={T3.laneAt} tone="neutral" label="cranker" pressAt={T3.pressAt} />
      <ActorChip frame={frame} fps={fps} lane={LANES[1].y} at={T3.laneAt + 4} tone="amber" label="accord" />
      <ActorChip frame={frame} fps={fps} lane={LANES[2].y} at={T3.laneAt + 8} tone="neutral" label="oracle" />

      {/* the accumulator root riding the Accord lifeline (C2 callback) */}
      <div className="absolute" style={{ left: 390, top: 440 }}>
        <MerkleSumTree
          frame={frame}
          leaves={[30, 20, 35, 15, 40, 25, 20, 35]}
          leafLabels={["", "", "", "", "", "", "", ""]}
          at={T3.laneAt + 10}
          width={190}
          height={104}
        />
        <div className="pointer-events-none absolute inset-0 bg-nearwhite/10" style={{ opacity: lockP }} />
        {/* the lock: root frozen at the callback */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: 88, top: 6, opacity: lockP, transform: `scale(${0.6 + 0.4 * lockP})` }}
        >
          <div className="h-2.5 w-4 rounded-t-full border-2 border-b-0 border-amber" />
          <div className="h-3 w-6 rounded-sm border border-amber bg-raised" />
        </div>
      </div>

      {/* messages */}
      <VMessage frame={frame} x={X.req} y0={396} y1={650} at={T3.reqAt} dur={15} label="request_vrf" />
      <VMessage frame={frame} x={X.freeze} y0={650} y1={530} at={T3.cbAt} dur={10} label="commit_vrf_callback" />

      <EntropyGlyph frame={frame} fps={fps} />

      {/* the veiled r — resolves only at commit */}
      <div
        className="absolute"
        style={{ left: 560, top: 592, opacity: enterAt(frame, fps, T3.rChipAt / 30, 0.35) * (veiled ? 1 : 0.75) }}
      >
        <MonoChip tone="amber">{rValue}</MonoChip>
      </div>

      {/* committed_vrf stamps into the Accord lane — same frame-pair as
          the freeze drop (hard rule 1: 114 + 115, 33 ms apart) */}
      {frame >= T3.stampAt ? (
        <div className="absolute" style={{ left: X.freeze + 16, top: 458, opacity: stampP }}>
          <MonoChip
            tone="amber"
            className="text-sm"
            style={{
              transform: `scale(${1.06 - 0.06 * stampP})`,
              boxShadow: stampFlash > 0 ? `0 0 ${18 * stampFlash}px var(--accord-amber)` : undefined,
            }}
          >
            committed_vrf
          </MonoChip>
        </div>
      ) : null}

      <FreezeLine frame={frame} />
      <div
        className="absolute"
        style={{ left: X.freeze + 12, top: 208, opacity: enterAt(frame, fps, T3.freezeLandAt / 30, 0.3) }}
      >
        <MonoChip tone="amber">freeze — root pinned</MonoChip>
      </div>

      {/* draw_seat × N marching along the frozen root */}
      {[0, 1, 2].map((i) => {
        const x0 = X.seat0 + i * 125;
        const at = T3.seatAt + i * 10;
        return (
          <Fragment key={i}>
            <StraightArrow frame={frame} from={{ x: x0, y: 506 }} to={{ x: x0 + 66, y: 506 }} at={at} dur={8} />
            <div
              className="absolute"
              style={{ left: x0 + 74, top: 534, opacity: enterAt(frame, fps, (at + 8) / 30, 0.25) }}
            >
              <MonoChip tone="amber">seat {i + 1}</MonoChip>
            </div>
          </Fragment>
        );
      })}

      {/* the dispute + the escape hatch */}
      <div className="absolute" style={{ left: X.dispute, top: 494, opacity: enterAt(frame, fps, T3.disputeAt / 30, 0.35) }}>
        <StateNode frame={frame} label="dispute" at={0} activeAt={T3.seatAt + 8} settleAt={T3.seatAt + 46} />
      </div>
      {frame >= T3.ringAt ? (
        <svg className="absolute" width={84} height={84} style={{ left: 1423, top: 467 }} aria-hidden="true">
          <circle
            cx={42}
            cy={42}
            r={39}
            fill="none"
            className="stroke-amber"
            strokeWidth={2}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - ringP}
            transform="rotate(-90 42 42)"
          />
        </svg>
      ) : null}
      <span
        className="absolute font-mono text-2xl tracking-widest text-muted-foreground"
        style={{ left: X.silence, top: LANES[2].y - 44, opacity: enterAt(frame, fps, T3.silenceAt / 30, 0.8) }}
      >
        ···
      </span>
      <StraightArrow frame={frame} from={{ x: 1500, y: 394 }} to={{ x: 1472, y: 468 }} at={T3.cancelAt} dur={10} />
      <div
        className="absolute"
        style={{ left: 1478, top: 402, opacity: enterAt(frame, fps, (T3.cancelAt + 2) / 30, 0.25) }}
      >
        <MonoChip tone="amber">cancel_dispute</MonoChip>
      </div>
      <div
        className="absolute"
        style={{ left: 1470, top: 560, opacity: enterAt(frame, fps, T3.refundAt / 30, 0.25) }}
      >
        <MonoChip tone="confirm">refund</MonoChip>
      </div>

      {/* window A — blind */}
      <Bracket frame={frame} fps={fps} x0={320} x1={920} y={240} at={T3.bracketAAt} label="window A — blind" />
      <Ghost frame={frame} x={400} y0={265} y1={318} at={T3.ghostAAt} outAt={T3.dissolveA} />
      <StraightArrow frame={frame} from={{ x: 415, y: 332 }} to={{ x: 505, y: 448 }} at={T3.attackAAt} dur={10} tone="slash" />
      <div
        className="absolute"
        style={{ left: 438, top: 366, opacity: enterAt(frame, fps, T3.attackAAt / 30, 0.25) }}
      >
        <MonoChip tone="slash">stake Δ</MonoChip>
      </div>
      <MiniRuler frame={frame} fps={fps} />
      <div
        className="absolute"
        style={{ left: 720, top: 352, translate: "-50% 0", opacity: enterAt(frame, fps, T3.aimTagAt / 30, 0.3) }}
      >
        <MonoChip tone="neutral">can aim at nothing</MonoChip>
      </div>

      {/* window B — inert */}
      <Bracket frame={frame} fps={fps} x0={980} x1={1660} y={240} at={T3.bracketBAt} label="window B — inert" />
      <Ghost frame={frame} x={1545} y0={265} y1={318} at={T3.ghostBAt} outAt={T3.footnoteAt + 20} />
      <DeflectedAttack frame={frame} />
      <div
        className="absolute"
        style={{ left: 1300, top: 356, opacity: enterAt(frame, fps, T3.attackBAt / 30, 0.25) }}
      >
        <MonoChip tone="slash">stake Δ</MonoChip>
      </div>
      <div
        className="absolute"
        style={{ left: 1020, top: 585, opacity: enterAt(frame, fps, T3.noopTagAt / 30, 0.3) }}
      >
        <MonoChip tone="amber">no-op — root frozen</MonoChip>
      </div>
      <div
        className="absolute"
        style={{ left: 1020, top: 622, opacity: enterAt(frame, fps, T3.footnoteAt / 30, 0.3) }}
      >
        <MonoChip tone="neutral">the live tree moves on; this draw doesn't</MonoChip>
      </div>

      {/* the atomicity captions */}
      <p
        className="absolute font-mono text-sm text-amber"
        style={{ left: X.freeze + 28, top: 742, opacity: enterAt(frame, fps, T3.capAtomAt / 30, 0.35) }}
      >
        atomic: commit r AND freeze root — one instruction
      </p>
      <p
        className="absolute font-mono text-sm text-text-secondary"
        style={{ left: X.freeze + 28, top: 770, opacity: enterAt(frame, fps, T3.capFreezeAt / 30, 0.35) }}
      >
        freeze at callback, not filing — capital stays live until the last safe instant
      </p>

      <BeatCopy at={0.97} out={2.9} copy="Timing is the defense" sub="the draw's two inputs — r and the root — pin together at one instruction" />
      <BeatCopy at={3.2} out={4.87} copy="Request → compute" sub="a cranker requests VRF; the oracle computes r — nobody knows it yet" />
      <BeatCopy at={3.87} out={5.2} copy="Commit AND freeze — atomically" sub="one instruction writes r and pins the root; chance stops moving" />
      <BeatCopy at={5.4} out={7.2} copy="Every seat, same frozen root" sub="draw_seat × N selects against the root + r pinned at the callback" />
      <BeatCopy at={7.47} out={9.9} copy="Before: blind" sub="you may restake — but r is unknown; reshaping is gambling, not biasing" />
      <BeatCopy at={10.6} out={13.2} copy="After: inert" sub="now r is known — but the root this draw uses cannot move" />
      <BeatCopy at={14.4} copy="Stall ≠ deadlock" sub="a silent oracle: any cranker cancels → refund — liveness is crankable" />
    </Scene>
  );
}
