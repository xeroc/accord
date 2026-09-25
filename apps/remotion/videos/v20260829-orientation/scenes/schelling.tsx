import type { FC, ReactNode } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { PhaseCaptions } from "../../../src/shell/rail";
import { MonoChip, TokenBadge } from "@useaccord/ui";

/**
 * A2 · The Schelling point = honesty. Left panel: three independent
 * jurors, three nested expectation arcs converging on one focal
 * answer, breathing in phase. Right panel: the 2×2 payoff matrix —
 * coherent strictly dominates, the slash cell is struck, stake ejects.
 * Then the caveat: a whale shadow traverses, the arcs desync, the
 * focal point drifts — the equilibrium is conditional on an honest
 * stake majority. Removal restores synchrony.
 */

const B = {
  panelAt: 3,
  // jurors cascade at 8 + i·3; arcs draw at 18 + i·12 (18f each, 400ms onsets)
  focalAt: 60, // forms + pulses once
  syncAt: 72, // breathing starts in phase
  noChannelAt: 24,
  axesAt: 90,
  cellsAt: [102, 105, 108, 111],
  sweepAt: 132, // dominance row sweep, 18f
  strikeAt: 150, // the firm slash strike, 8f
  ejectAt: 152,
  cap1At: 156, // "coherent strictly dominates"
  dimAt: 174, // matrix dims while the whale owns the left panel
  whaleAt: 180, // 60f traverse behind the left panel
  desyncAt: 186,
  driftAt: 192, // focal drifts + dims
  cap2At: 204, // caveat caption
  resyncAt: 240,
  recentAt: 246, // focal re-centers
  undimAt: 258,
  capOutAt: 268,
  cap3At: 296, // final takeaway
} as const;

/** Focal node center. */
const FOCAL = { x: 720, y: 545 };
const JURORS = [
  { x: 240, y: 356, label: "juror 1" },
  { x: 185, y: 528, label: "juror 2" },
  { x: 240, y: 712, label: "juror 3" },
] as const;

const ARCS = [
  { d: "M 278 362 Q 520 318 706 528", label: "you expect me to vote honestly", lx: 505, ly: 344 },
  { d: "M 222 532 Q 480 492 704 542", label: "so you will vote honestly", lx: 470, ly: 478 },
  { d: "M 278 718 Q 520 762 706 562", label: "so I vote honestly", lx: 505, ly: 736 },
] as const;

/* Deterministic motion math — same dialect as map.tsx. */
const tw = (frame: number, from: number, dur: number, y0: number, y1: number) =>
  interpolate(frame, [from, from + dur], [y0, y1], { easing: EASE_EXPO, ...clamp });
const lin = (frame: number, from: number, dur: number, y0: number, y1: number) =>
  interpolate(frame, [from, from + dur], [y0, y1], clamp);
const bump = (frame: number, from: number, dur: number) =>
  frame <= from || frame >= from + dur ? 0 : Math.sin(Math.PI * ((frame - from) / dur));

/** Distortion amount 0→1→0 across the whale window (desync, drift, bow). */
const distortion = (frame: number) =>
  frame < B.desyncAt
    ? 0
    : frame < B.desyncAt + 30
      ? lin(frame, B.desyncAt, 30, 0, 1)
      : frame < B.resyncAt
        ? 1
        : lin(frame, B.resyncAt, 20, 1, 0);

/** ExpectationArc — one nested arc: draws, then breathes (phase = content). */
const ExpectationArc: FC<{
  frame: number;
  d: string;
  label: string;
  lx: number;
  ly: number;
  at: number;
  index: number;
  bow: number;
}> = ({ frame, d, label, lx, ly, at, index, bow }) => {
  const draw = tw(frame, at, 18, 0, 1);
  const phase = distortion(frame) * index * 1.7;
  const breathe = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin((frame * 2 * Math.PI) / 90 + phase));
  const bowed = index === 2 ? d.replace("Q 520 762", `Q 520 ${762 + bow}`) : d;
  return (
    <g opacity={breathe}>
      <path
        d={bowed}
        fill="none"
        className="stroke-text-secondary"
        stroke="currentColor"
        strokeWidth={2}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
      <text
        x={lx}
        y={ly}
        textAnchor="middle"
        className="fill-text-secondary font-mono"
        style={{ fontSize: 15, opacity: tw(frame, at + 14, 8, 0, 1) }}
      >
        {label}
      </text>
    </g>
  );
};

/** PayoffCell — one matrix cell: settles, carries its payoff wording. */
const PayoffCell: FC<{
  frame: number;
  at: number;
  x: number;
  y: number;
  tone: "confirm" | "slash" | "neutral";
  title: string;
  sub?: string;
}> = ({ frame, at, x, y, tone, title, sub }) => {
  const toneCls =
    tone === "confirm"
      ? "border-confirm/40 text-confirm"
      : tone === "slash"
        ? "border-slash/40 text-slash"
        : "border-border-subtle text-muted-foreground";
  return (
    <div
      className={`absolute flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-raised/50 ${toneCls}`}
      style={{
        left: x,
        top: y,
        width: 300,
        height: 190,
        opacity: tw(frame, at, 10, 0, 1),
        transform: `translateY(${tw(frame, at, 10, 8, 0)}px)`,
      }}
    >
      <span className="font-mono text-lg">{title}</span>
      {sub ? <span className="font-mono text-xs text-muted-foreground">{sub}</span> : null}
    </div>
  );
};

/** Bottom caption with enter/exit. */
const Caption: FC<{ frame: number; at: number; outAt?: number; children: ReactNode; dim?: boolean }> = ({
  frame,
  at,
  outAt,
  children,
  dim,
}) => (
  <p
    className={`absolute w-full text-center font-mono text-xl ${dim ? "text-text-secondary" : "text-nearwhite"}`}
    style={{
      top: 980,
      opacity: tw(frame, at, 12, 0, 1) * (outAt !== undefined ? tw(frame, outAt, 8, 1, 0) : 1),
    }}
  >
    {children}
  </p>
);

export function SchellingScene() {
  const frame = useCurrentFrame();

  const distort = distortion(frame);
  const focalPulse = 1 + 0.06 * bump(frame, B.focalAt, 15);
  const focalX = FOCAL.x + distort * 10;
  const focalOp = 1 - distort * 0.4;

  // whale traverse: crosses behind the left panel only; bob + scale keyframes
  const whaleX = lin(frame, B.whaleAt, 60, -400, 700);
  const whaleBob = 10 * Math.sin(((frame - B.whaleAt) * 2 * Math.PI) / 45);
  const whaleScale = interpolate(frame, [B.whaleAt, B.whaleAt + 30, B.whaleAt + 60], [0.9, 1, 0.95], clamp);
  const whaleOp = interpolate(frame, [B.whaleAt, B.whaleAt + 9, B.whaleAt + 51, B.whaleAt + 60], [0, 0.8, 0.8, 0], clamp);

  const dimAmount = tw(frame, B.dimAt, 12, 0, 1) * (1 - tw(frame, B.undimAt, 12, 0, 1));
  const matrixDim = 1 - 0.6 * dimAmount;
  const sweep = lin(frame, B.sweepAt, 18, 0, 1);
  const strike = tw(frame, B.strikeAt, 8, 0, 1);

  const capActive = frame < 90 ? 0 : frame < 174 ? 1 : frame < 240 ? 2 : 3;

  return (
    <Scene seed="orientation-schelling">
      <div className="absolute inset-0">
        {/* header chrome */}
        <header className="absolute left-16 top-10 right-16 flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-sm tracking-[0.4em] text-amber">A2 · THE SCHELLING POINT</span>
            <span className="font-mono text-xs text-muted-foreground">
              independent convergence → one focal answer
            </span>
          </div>
          <PhaseCaptions labels={["converge", "dominate", "whale", "restore"]} active={capActive} className="mt-1" />
        </header>

        {/* left panel — independent convergence */}
        <div
          className="absolute rounded-3xl border border-border-subtle bg-ink/20"
          style={{
            left: 80,
            top: 170,
            width: 940,
            height: 700,
            opacity: tw(frame, B.panelAt, 12, 0, 1),
          }}
        >
          <span className="absolute left-6 top-4 font-mono text-xs tracking-[0.35em] text-text-secondary">
            independent convergence
          </span>
        </div>
        <p
          className="absolute font-mono text-xs text-muted-foreground"
          style={{ left: 104, top: 838, opacity: tw(frame, B.noChannelAt, 10, 0, 1) }}
        >
          no channel between them
        </p>

        {/* the whale shadow — behind the arcs, blurred, no face */}
        {whaleOp > 0 ? (
          <svg
            className="pointer-events-none absolute text-nearwhite/25"
            style={{
              left: whaleX,
              top: 590 + whaleBob,
              width: 360,
              height: 170,
              opacity: whaleOp,
              scale: String(whaleScale),
              filter: "blur(9px)",
            }}
            viewBox="0 0 360 170"
            fill="currentColor"
            aria-hidden
          >
            <path d="M 40 80 C 60 20 180 0 260 30 C 320 52 340 80 320 96 C 300 112 240 120 180 112 C 120 140 60 140 40 120 C 20 108 20 96 40 80 Z" />
            <path d="M 300 40 L 348 12 L 338 56 Z" />
            <path d="M 150 108 L 170 144 L 192 108 Z" />
          </svg>
        ) : null}

        {/* arcs + jurors + focal */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1920 1080" fill="none" aria-hidden>
          {ARCS.map((arc, i) => (
            <ExpectationArc
              key={arc.label}
              frame={frame}
              d={arc.d}
              label={arc.label}
              lx={arc.lx}
              ly={arc.ly}
              at={18 + i * 12}
              index={i}
              bow={distort * 16}
            />
          ))}
          <g opacity={tw(frame, B.focalAt, 10, 0, 1) * focalOp} transform={`translate(${focalX - FOCAL.x} 0)`}>
            <circle cx={FOCAL.x} cy={FOCAL.y} r={16} className="stroke-amber/60" stroke="currentColor" strokeWidth={2} />
            <circle cx={FOCAL.x} cy={FOCAL.y} r={9} className="fill-amber" fill="currentColor" style={{ boxShadow: "none" }} />
            <g transform={`translate(${FOCAL.x} ${FOCAL.y}) scale(${focalPulse})`}>
              <circle r={26} className="stroke-amber/30" stroke="currentColor" strokeWidth={1.5} />
            </g>
          </g>
          <text
            x={FOCAL.x}
            y={598}
            textAnchor="middle"
            className="fill-amber font-mono"
            style={{ fontSize: 16, opacity: tw(frame, B.focalAt + 8, 8, 0, 1) * focalOp }}
          >
            the focal answer — honesty
          </text>
        </svg>
        {JURORS.map((j, i) => (
          <div
            key={j.label}
            className="absolute"
            style={{
              left: j.x,
              top: j.y,
              translate: "-50% -50%",
              opacity: tw(frame, 8 + i * 3, 10, 0, 1),
              transform: `translateY(${tw(frame, 8 + i * 3, 10, -8, 0)}px)`,
            }}
          >
            <MonoChip tone="neutral" className="px-4 py-2 text-sm">
              {j.label}
            </MonoChip>
          </div>
        ))}

        {/* right panel — payoff matrix */}
        <div
          className="absolute rounded-3xl border border-border-subtle bg-ink/20"
          style={{
            left: 1060,
            top: 170,
            width: 800,
            height: 700,
            opacity: tw(frame, B.axesAt - 6, 12, 0, 1),
          }}
        >
          <span className="absolute left-6 top-4 font-mono text-xs tracking-[0.35em] text-text-secondary">
            payoff matrix
          </span>
        </div>

        <div className="absolute inset-0" style={{ opacity: matrixDim }}>
          {/* axes labels */}
          <div
            className="absolute flex w-[600px] justify-between"
            style={{ left: 1230, top: 258, opacity: tw(frame, B.axesAt, 10, 0, 1) }}
          >
            <span className="w-[300px] text-center font-mono text-sm text-text-secondary">majority · coherent</span>
            <span className="w-[300px] text-center font-mono text-sm text-text-secondary">majority · incoherent</span>
          </div>
          <div
            className="absolute text-center font-mono text-sm text-text-secondary"
            style={{ left: 1075, top: 386, width: 155, opacity: tw(frame, B.axesAt + 3, 10, 0, 1) }}
          >
            you vote
            <br />
            <span className="text-nearwhite">coherent</span>
          </div>
          <div
            className="absolute text-center font-mono text-sm text-text-secondary"
            style={{ left: 1075, top: 576, width: 155, opacity: tw(frame, B.axesAt + 3, 10, 0, 1) }}
          >
            you vote
            <br />
            <span className="text-nearwhite">incoherent</span>
          </div>

          {/* cells: rows = your vote, cols = majority */}
          <PayoffCell frame={frame} at={B.cellsAt[0]} x={1230} y={300} tone="confirm" title="+ fee" sub="+ share of slashed stake" />
          <PayoffCell frame={frame} at={B.cellsAt[2]} x={1530} y={300} tone="slash" title="− slashed" sub="coherent, in the minority" />
          <PayoffCell frame={frame} at={B.cellsAt[1]} x={1230} y={490} tone="slash" title="− stake slashed" sub="incoherent vs honest majority" />
          <PayoffCell frame={frame} at={B.cellsAt[3]} x={1530} y={490} tone="neutral" title="only under a" sub="dishonest majority" />

          {/* dominance sweep across the coherent row */}
          {sweep > 0 && sweep < 1 ? (
            <div className="pointer-events-none absolute overflow-hidden rounded-xl" style={{ left: 1230, top: 300, width: 600, height: 190 }}>
              <div
                className="h-full w-1/3 bg-gradient-to-r from-transparent via-nearwhite/10 to-transparent"
                style={{ transform: `translateX(${sweep * 300 - 100}%)` }}
              />
            </div>
          ) : null}

          {/* the firm strike through the slash cell */}
          <div
            className="absolute h-[3px] origin-left rounded-full bg-slash"
            style={{ left: 1272, top: 584, width: 216, transform: `scaleX(${strike})` }}
          />

          {/* ejected stake chips arcing out of the slash cell */}
          {[0, 1].map((k) => {
            const t = lin(frame, B.ejectAt + k * 2, 12, 0, 1);
            if (t <= 0 || t >= 1) {
              return null;
            }
            const dir = k === 0 ? -1 : 1;
            const x = 1380 + dir * t * 84;
            const y = 585 + t * 66 - Math.sin(Math.PI * t) * 34;
            return (
              <div key={k} className="absolute" style={{ left: x, top: y, translate: "-50% -50%", opacity: 1 - t }}>
                <TokenBadge frame={frame} tone="stake" amount={25} label="stake" at={B.ejectAt + k * 2} />
              </div>
            );
          })}

          <p
            className="absolute text-center font-mono text-lg text-nearwhite"
            style={{ left: 1230, top: 726, width: 600, opacity: tw(frame, B.cap1At, 10, 0, 1) }}
          >
            coherent strictly dominates
          </p>
        </div>

        {/* captions */}
        <Caption frame={frame} at={B.cap2At} outAt={B.capOutAt} dim>
          …conditional on an honest stake majority
        </Caption>
        <Caption frame={frame} at={B.cap3At}>
          honesty is the Schelling point
        </Caption>
      </div>
    </Scene>
  );
}
