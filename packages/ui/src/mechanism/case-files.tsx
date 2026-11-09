import type { FC } from "react";

import { cn } from "../internal/cn";

/**
 * CaseFiles — the failure-case story cards (hero right column): three
 * anonymized disputes that ended differently depending on who answered.
 * Cards float on staggered phases, each mini-visual loops on its own
 * period (control bar, chain with a glitched block and rewind arrow,
 * split verdicts). Pure function of `frame` — the kit clock contract;
 * frame 0 (reduced motion) is the settled still.
 */

/** The three mini-visuals a case card can carry. */
export type CaseVisual = "control" | "chain" | "verdicts";

export interface CaseFile {
  /** Ordinal shown in the eyebrow — "CASE 01". */
  id: string;
  /** Eyebrow segment after the id — "ORACLE". */
  type: string;
  /** The one-line claim, set in Plex Sans. */
  title: string;
  /** Status chip text — "DISPUTED". */
  status: string;
  visual: CaseVisual;
}

/** The landing's three failure cases — anonymized by brand law
 * (Kleros is the only citable project). */
export const CASE_FILES: readonly CaseFile[] = [
  {
    id: "01",
    type: "ORACLE",
    title: "One actor controls the outcome.",
    status: "DISPUTED",
    visual: "control",
  },
  {
    id: "02",
    type: "ROLLBACK",
    title: "The chain rewrites history.",
    status: "REVERSED",
    visual: "chain",
  },
  {
    id: "03",
    type: "COURTS",
    title: "Four courts. Four answers.",
    status: "CONFLICT",
    visual: "verdicts",
  },
];

/** Ping-pong 0→1→0 over `period` frames, eased both ways (CSS
 * ease-in-out). Names the wave so the caller reads as a cycle. */
const pingPong = (frame: number, period: number) => {
  const p = frame % (period * 2);
  const t = (p < period ? p : period * 2 - p) / period;
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

/** Sine bump 0→1→0 over `period` frames (peaks mid-period). Shared by
 * every blinking dot, the rewind arrow, and the verdict pulse so the
 * phases stay consistent. */
const bump = (frame: number, period: number) => Math.sin((Math.PI * (frame % period)) / period);

const ControlVisual: FC<{ frame: number }> = ({ frame }) => {
  // 25% → 72% control, 3s each way.
  const width = 25 + 47 * pingPong(frame, 90);
  return (
    <div className="mt-4">
      <div className="h-1 w-full bg-border">
        <div className="h-full bg-amber" style={{ width: `${width}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[8px] tracking-[0.14em] text-muted-foreground">
        <span>25% CONTROL</span>
        <span>MARKET SHIFT</span>
      </div>
    </div>
  );
};

const ChainVisual: FC<{ frame: number }> = ({ frame }) => {
  // The third block glitches out near the end of its 2s cycle.
  const g = (frame % 60) / 60;
  const glitch = g < 0.92 ? 1 : g < 0.96 ? 0.2 : 0.8 + (g - 0.96) * 5;
  return (
    <div className="mt-4 flex items-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={cn(
            "grid h-[26px] w-[30px] place-items-center border font-mono text-[10px]",
            n === 3 ? "border-amber/70 text-amber" : "border-border text-muted-foreground",
          )}
          style={n === 3 ? { opacity: glitch } : undefined}
        >
          {n === 3 ? "!" : "◆"}
        </div>
      ))}
      <span
        className="ml-auto font-mono text-2xl leading-none text-amber"
        style={{ transform: `rotate(${-45 * bump(frame, 60)}deg)` }}
      >
        ↶
      </span>
    </div>
  );
};

const VerdictsVisual: FC<{ frame: number }> = ({ frame }) => (
  <div className="mt-4 flex gap-[7px]">
    {["YES", "NO", "YES", "NO"].map((v, n) => (
      <div
        key={n}
        className={cn(
          "flex-1 border border-border py-2 text-center font-mono text-[9px] tracking-[0.1em]",
          v === "YES" ? "text-confirm" : "text-slash",
        )}
        // Even verdicts pulse half a period late — a split that never syncs.
        style={{ backgroundColor: `rgba(240, 246, 252, ${0.06 * bump(frame + (n % 2 === 0 ? 45 : 0), 90)})` }}
      >
        {v}
      </div>
    ))}
  </div>
);

export const CaseFiles: FC<{
  /** Monotonic frame counter (useWallClockFrame / useCurrentFrame). */
  frame: number;
  cases?: readonly CaseFile[];
  caption?: string;
  className?: string;
}> = ({ frame, cases = CASE_FILES, className }) => (
  <div
    className={cn("relative flex h-[410px] w-full max-w-[520px] flex-col justify-center gap-3", className)}
  >
    {cases.map((c, i) => {
      // 5s float, staggered 1.5s per card.
      return (
        <article
          key={c.id}
          className="relative z-[1] rounded-md border border-border bg-raised/90 px-[18px] py-[15px] transition-colors hover:border-amber"
        >
          <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            <span>
              CASE {c.id} / {c.type}
            </span>
            <span className="flex items-center gap-[7px]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-amber"
              />
              {c.status}
            </span>
          </div>

          <div className="py-3">
            <strong className="font-sans text-[15px] font-medium tracking-tight text-nearwhite">
              {c.title}
            </strong>
            {c.visual === "control" ? <ControlVisual frame={frame} /> : null}
            {c.visual === "chain" ? <ChainVisual frame={frame} /> : null}
            {c.visual === "verdicts" ? <VerdictsVisual frame={frame} /> : null}
          </div>

          <div className="flex items-center justify-between border-t border-border/70 pt-2.5 font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
            <span>ARBITRATION REQUIRED</span>
            <span className="text-[15px] text-amber">↗</span>
          </div>
        </article>
      );
    })}
  </div>
);
