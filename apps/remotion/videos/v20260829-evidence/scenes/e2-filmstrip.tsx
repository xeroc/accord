import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt, scramble } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { PhaseCaptions } from "../../../src/shell/rail";
import { Scene } from "../../../src/shell/scene";
import { PanelLadder } from "@useaccord/ui";

/**
 * E2 — per-round evidence hashes, played once (linear cut of the 7s
 * loop proposal). A film strip of four on-chain slots along the appeal
 * ladder: filing writes frame 0, appeals write frames 1 and 3, and
 * round 2 leaves the zero-sentinel — "inherit prior rounds," never
 * "no evidence." Each panel's dossier rests on its ladder step and
 * visibly stacks the accumulated non-zero set; the ghost is absent
 * from every dossier on purpose.
 */

const FRAMES = [
  { hex: "a3f9…", ghost: false },
  { hex: "77c2…", ghost: false },
  { hex: "00…00", ghost: true },
  { hex: "e1b0…", ghost: false },
] as const;

/** Beat table (frames, 30 fps). */
const B = {
  frameDraw: (i: number) => 2 + i * 2,
  ladderAt: 8,
  ladderStagger: 22,
  dossierAt: (i: number) => 12 + i * 4,
  fillAt: (i: number) => [46, 72, 108, 144][i] ?? 108,
  bracketAt: (d: number) => (d === 2 ? 122 : 156),
  sweepAt: 168,
  labelAt: 178,
  waveAt: 200,
} as const;

const PHASES = [
  { label: "filed", start: 0 },
  { label: "appeal 1", start: 58 },
  { label: "inherit", start: 96 },
  { label: "appeal 3", start: 132 },
  { label: "resolved", start: 168 },
] as const;

interface Pt {
  x: number;
  y: number;
}

/** Film-strip band (y 210–400), pitch 192 aligned to the ladder columns. */
const CENTER = (i: number) => 672 + 192 * i;
const FRAME_X = (i: number) => 584 + 192 * i;
const FRAME = { y: 210, w: 176, h: 190 } as const;

/** Dossiers rest on the ladder steps (step tops 900/820/740/660). */
const DOSSIER = {
  x: (i: number) => 587 + 192 * i,
  w: 170,
  h: [150, 185, 185, 225],
  bottom: [888, 808, 728, 648],
} as const;

const thumbPos = (d: number, lvl: number): Pt => ({
  x: DOSSIER.x(d) + 12 + lvl * 10 + 68,
  y: (DOSSIER.bottom[d] ?? 648) - 50 - lvl * 26 + 25,
});
const frameSrc = (i: number): Pt => ({ x: CENTER(i), y: 396 });

/** One thumbnail flight: frame/dossier → dossier slot. */
const FLIGHTS: Array<{ d: number; f: number; lvl: number; at: number; dur: number; from: Pt }> = [
  { d: 0, f: 0, lvl: 0, at: 48, dur: 10, from: frameSrc(0) },
  { d: 1, f: 0, lvl: 0, at: 72, dur: 10, from: frameSrc(0) },
  { d: 1, f: 1, lvl: 1, at: 84, dur: 8, from: frameSrc(1) },
  { d: 2, f: 0, lvl: 0, at: 108, dur: 16, from: thumbPos(1, 0) },
  { d: 2, f: 1, lvl: 1, at: 108, dur: 16, from: thumbPos(1, 1) },
  { d: 3, f: 0, lvl: 0, at: 144, dur: 14, from: thumbPos(2, 0) },
  { d: 3, f: 1, lvl: 1, at: 144, dur: 14, from: thumbPos(2, 1) },
  { d: 3, f: 3, lvl: 2, at: 158, dur: 10, from: frameSrc(3) },
];

/** The filing + appeal chips that write the frames. */
const CHIPS: Array<{ text: string; ghost: boolean; p0: Pt; p1: Pt; at: number; dur: number }> = [
  { text: "Dispute filed · manifest hash", ghost: false, p0: { x: 430, y: 330 }, p1: { x: CENTER(0), y: 305 }, at: 34, dur: 10 },
  { text: "appeal · new evidence", ghost: false, p0: { x: 380, y: 620 }, p1: { x: CENTER(1), y: 305 }, at: 60, dur: 10 },
  { text: "appeal · no new evidence", ghost: true, p0: { x: 380, y: 620 }, p1: { x: CENTER(2), y: 305 }, at: 96, dur: 10 },
  { text: "appeal · new evidence", ghost: false, p0: { x: 380, y: 620 }, p1: { x: CENTER(3), y: 305 }, at: 132, dur: 10 },
];

const qp = (p0: Pt, c: Pt, p1: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p1.y,
});
const bowCtrl = (p0: Pt, p1: Pt): Pt => ({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 - 18 });

export function E2FilmstripScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ease = { easing: EASE_EXPO, ...clamp };

  const activePhase = PHASES.reduce((acc, p, i) => (frame >= p.start ? i : acc), 0);

  // resolution hold geometry
  const sweepK = interpolate(frame, [B.sweepAt, B.sweepAt + 18], [0, 1], ease);

  return (
    <Scene seed="e2-filmstrip">
      <div className="absolute inset-0">
        {/* headline + captions own the top band */}
        <div
          className="absolute left-0 w-full text-center font-mono text-sm uppercase tracking-[0.35em] text-text-secondary"
          style={{ top: 54, opacity: enterAt(frame, fps, 0.2, 0.4) }}
        >
          e2 · per-round evidence hashes
        </div>
        <div className="absolute left-0 w-full" style={{ top: 96 }}>
          <PhaseCaptions labels={PHASES.map((p) => p.label)} active={activePhase} />
        </div>
        <div
          className="absolute left-0 w-full text-center font-mono text-sm text-text-secondary"
          style={{ top: 164, opacity: enterAt(frame, fps, 0.35, 0.4) }}
        >
          evidence_hashes[0..=3] · on-chain
        </div>

        {/* ================= film strip ================= */}
        {FRAMES.map((f, i) => {
          const draw = interpolate(frame, [B.frameDraw(i), B.frameDraw(i) + 7], [0, 1], clamp);
          const fillAt = B.fillAt(i);
          const fill = interpolate(frame, [fillAt, fillAt + 8], [0, 1], ease);
          const hex = scramble(`e2-f${i}`, frame, f.hex, frame >= fillAt + 4);
          const wave = interpolate(
            frame,
            [B.waveAt + i * 4, B.waveAt + i * 4 + 4, B.waveAt + i * 4 + 12],
            [0, 1, 0],
            clamp,
          );
          return (
            <Interactive.Div
              key={i}
              name={`Frame ${i}`}
              className="absolute"
              style={{ left: FRAME_X(i), top: FRAME.y, width: FRAME.w, height: FRAME.h }}
            >
              <svg
                viewBox="0 0 176 190"
                className="absolute inset-0 h-full w-full text-border-subtle"
              >
                <rect
                  x={1.5}
                  y={1.5}
                  width={173}
                  height={187}
                  rx={8}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - draw}
                />
              </svg>
              {/* slot index */}
              <span
                className="absolute left-2.5 top-1.5 font-mono text-[10px] text-muted-foreground"
                style={{ opacity: draw }}
              >
                [{i}]
              </span>

              {f.ghost ? (
                /* the zero-sentinel — dashed, translucent, floating; never a value */
                <div
                  className="absolute rounded-md border-2 border-dashed border-border-subtle"
                  style={{
                    inset: 7,
                    opacity: 0.45 * interpolate(frame, [fillAt, fillAt + 10], [0, 1], ease),
                    transform: `translateY(${
                      interpolate(frame, [fillAt, fillAt + 10], [10, 0], ease) +
                      3 * Math.sin(frame / 28) * interpolate(frame, [fillAt + 10, fillAt + 16], [0, 1], clamp)
                    }px)`,
                  }}
                >
                  <div className="flex h-full flex-col items-center justify-center gap-1.5">
                    <span className="font-mono text-base text-text-secondary">{f.hex}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">inherit</span>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="absolute rounded-md border border-amber/30 bg-amber/10"
                    style={{
                      inset: 7,
                      opacity: fill,
                      transform: `scale(${0.96 + fill * 0.04})`,
                      boxShadow: wave > 0 ? `0 0 ${10 * wave}px var(--accord-amber)` : undefined,
                    }}
                  />
                  <div
                    className="absolute inset-0 flex items-center justify-center font-mono text-base text-amber"
                    style={{ opacity: fill }}
                  >
                    {hex}
                  </div>
                </>
              )}
            </Interactive.Div>
          );
        })}

        {/* sprockets — slow sine drift, never linear */}
        {[190, 410].map((y) => (
          <div key={y}>
            {Array.from({ length: 24 }, (_, s) => {
              const x = 592 + s * 32;
              return (
                <div
                  key={s}
                  className="absolute rounded-[2px] bg-nearwhite/15"
                  style={{
                    left: x,
                    top: y,
                    width: 18,
                    height: 9,
                    transform: `translateY(${3 * Math.sin(frame / 40 + s)}px)`,
                    opacity: interpolate(frame, [4, 14], [0, 1], clamp),
                  }}
                />
              );
            })}
          </div>
        ))}

        {/* filing + appeal chips flying into their frames */}
        {CHIPS.map((chip) => {
          const t = interpolate(frame, [chip.at, chip.at + chip.dur], [0, 1], ease);
          if (t <= 0 || t >= 1) return null;
          const pos = qp(chip.p0, bowCtrl(chip.p0, chip.p1), chip.p1, t);
          const out = interpolate(t, [0.85, 1], [1, 0], clamp);
          return (
            <div
              key={chip.text + chip.at}
              className={`absolute rounded-full border px-3 py-1 font-mono text-xs ${
                chip.ghost
                  ? "border-dashed border-border-subtle text-muted-foreground"
                  : "border-border-subtle bg-raised text-text-secondary"
              }`}
              style={{
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
                opacity: out,
              }}
            >
              {chip.text}
            </div>
          );
        })}

        {/* thumbnail copies arcing into the dossiers */}
        {FLIGHTS.map((fl) => {
          const t = interpolate(frame, [fl.at, fl.at + fl.dur], [0, 1], ease);
          if (t <= 0 || t >= 1) return null;
          const to = thumbPos(fl.d, fl.lvl);
          const pos = qp(fl.from, bowCtrl(fl.from, to), to, t);
          return (
            <div
              key={`${fl.d}-${fl.f}-${fl.at}`}
              className="absolute flex items-center justify-center rounded-md border border-amber/50 bg-amber/20 font-mono text-[10px] text-amber"
              style={{
                left: pos.x,
                top: pos.y,
                width: 56,
                height: 34,
                transform: "translate(-50%, -50%)",
              }}
            >
              {(FRAMES[fl.f] ?? FRAMES[0]).hex}
            </div>
          );
        })}

        {/* ================= dossiers on the ladder ================= */}
        {DOSSIER.h.map((h, d) => {
          const inK = interpolate(frame, [B.dossierAt(d), B.dossierAt(d) + 6], [0, 1], ease);
          const contents = FLIGHTS.filter((fl) => fl.d === d);
          const maxLvl = contents.reduce((m, fl) => Math.max(m, fl.lvl), 0);
          const bracketDraw = interpolate(
            frame,
            [B.bracketAt(d), B.bracketAt(d) + 5],
            [0, 1],
            clamp,
          );
          return (
            <Interactive.Div
              key={d}
              name={`Dossier ${d}`}
              className="absolute flex flex-col rounded-lg border border-border-subtle bg-raised/60"
              style={{
                left: DOSSIER.x(d),
                top: (DOSSIER.bottom[d] ?? 648) - h,
                width: DOSSIER.w,
                height: h,
                opacity: inK,
                transform: `translateY(${(1 - inK) * 12}px)`,
              }}
            >
              <div className="px-3 pt-2 font-mono text-[11px] text-muted-foreground">
                dossier · r{d}
              </div>
              {d >= 2 ? (
                /* the carried-forward pair, bracketed — the ghost is not here */
                <div className="flex items-center gap-1.5 px-3 pt-1">
                  <svg viewBox="0 0 26 10" width={26} height={10} className="text-muted-foreground">
                    <path
                      d="M 2 9 V 2 H 24 V 9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - bracketDraw}
                    />
                  </svg>
                  <span
                    className="font-mono text-[10px] text-muted-foreground"
                    style={{ opacity: bracketDraw }}
                  >
                    carried forward
                  </span>
                </div>
              ) : null}
              {/* thumbnails stack from the bottom */}
              {contents.map((fl) => {
                const pop = interpolate(frame, [fl.at + fl.dur + 1, fl.at + fl.dur + 5], [0, 1], ease);
                return (
                  <div
                    key={fl.f}
                    className={`absolute flex items-center justify-between rounded-md border bg-amber/10 px-2 font-mono text-[11px] text-amber ${
                      fl.lvl === maxLvl ? "border-amber/70" : "border-amber/30"
                    }`}
                    style={{
                      left: 12 + fl.lvl * 10,
                      width: 136,
                      height: 50,
                      top: h - 50 - fl.lvl * 26,
                      opacity: pop,
                      transform: `scale(${0.96 + pop * 0.04})`,
                    }}
                  >
                    <span className="text-muted-foreground">f{fl.f}</span>
                    <span>{(FRAMES[fl.f] ?? FRAMES[0]).hex}</span>
                  </div>
                );
              })}
            </Interactive.Div>
          );
        })}

        {/* ================= the appeal ladder ================= */}
        <div className="absolute" style={{ left: 576, bottom: 100 }}>
          <div style={{ transform: "scale(2)", transformOrigin: "bottom left" }}>
            <PanelLadder
              frame={frame}
              at={B.ladderAt}
              stagger={B.ladderStagger}
              stepHeight={40}
              dotSize={7}
              labels={["r0 · 3", "r1 · 7", "r2 · 15", "r3 · 31"]}
            />
          </div>
        </div>

        {/* ================= resolution ================= */}
        <div
          className="absolute rounded-full bg-amber"
          style={{ left: 1155, top: DOSSIER.bottom[3] + 10, height: 3, width: 186 * sweepK }}
        />
        <div
          className="absolute font-mono text-sm text-amber"
          style={{
            left: 1138,
            top: DOSSIER.bottom[3] + 20,
            opacity: interpolate(frame, [B.labelAt, B.labelAt + 8], [0, 1], ease),
          }}
        >
          non-zero set → round-3 jurors
        </div>
      </div>
    </Scene>
  );
}
