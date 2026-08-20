import { useCurrentFrame } from "remotion";

import { MonoChip } from "@useaccord/ui";
import { ConceptScene, breath, draw, lin, pop, rise, tw } from "./chrome";

/**
 * F5 — scalar voting: median + coherence band.
 *
 * Left: plurality coherence is exact-match — near misses are slashed.
 * Right: Median disputes tally the median of u64 fixed-point reveals
 * and coherence is a ±1% band (tol_bps). Same distance from the
 * result, different outcome — that contrast is the scene.
 */

const BASE_Y = 470;
const MEDIAN_X = 980;
const BAND_HALF = 70;

const BARS = [180, 250, 238, 250, 205, 250, 140] as const;
const EXACT = [false, true, false, true, false, true, false] as const;
const RULING_BAR = 3;
const NEAR_MISS_BAR = 2;

/** vote dots as px offsets from the median */
const DOTS = [-150, -118, -92, -46, 0, 14, 40, 76, 148] as const;
const MEDIAN_DOT = 4;
const NEAR_MISS_DOT = 5;
const BOUNDARY_DOT = 7;

function passFrame(x: number): number {
  return 144 + ((x - 760) / 520) * 15;
}

export function F5MedianScene() {
  const frame = useCurrentFrame();
  const sweepX = 760 + lin(frame, 144, 159, 0, 520);
  const bandOp = 0.85 + 0.15 * breath(frame, 120, 0.8);

  return (
    <ConceptScene
      seed="robustness-f5"
      kicker="SCALAR VOTING"
      title="median + coherence band"
      caption="|vote − final_ruling|·10⁴ ≤ final_ruling·tol_bps — a band, not a knife-edge"
    >
      <div className="relative" style={{ width: 1360, height: 560 }}>
        {/* divider */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1360 560" fill="none">
          <line x1={680} y1={44} x2={680} y2={520} className="text-border-subtle" stroke="currentColor" strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 3, 12)} />
          {/* number line */}
          <line x1={760} y1={330} x2={1280} y2={330} className="text-border-subtle" stroke="currentColor" strokeWidth={1.5} pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 66, 12)} />
          {/* connector — the contrast line */}
          <line
            x1={150 + NEAR_MISS_BAR * 72 + 20} y1={BASE_Y - 238 - 6} x2={MEDIAN_X + 14} y2={330 - 14}
            className="text-confirm/60" stroke="currentColor" strokeWidth={1.5} strokeDasharray="6 6"
            pathLength={1} strokeDashoffset={draw(frame, 174, 15)}
          />
        </svg>

        {/* panel titles */}
        <div className="absolute font-mono text-lg text-text-secondary" style={{ left: 360, top: 54, translate: "-50% 0", ...rise(frame, 6, 9) }}>
          Plurality — exact match
        </div>
        <div className="absolute font-mono text-lg text-text-secondary" style={{ left: 1000, top: 54, translate: "-50% 0", ...rise(frame, 9, 9) }}>
          Median — within band
        </div>

        {/* left panel — the plurality bars */}
        <div className="absolute flex items-end" style={{ left: 150, top: BASE_Y - 260, height: 260 }}>
          {BARS.map((h, i) => {
            const barAt = 18 + i * 4;
            const height = h * tw(frame, barAt, barAt + 10, 0, 1);
            const slashed = !EXACT[i] && frame >= 57;
            return (
              <div key={i} className="relative mr-[32px] flex flex-col items-center">
                {EXACT[i] && frame >= 63 ? (
                  <div className="mb-1" style={pop(frame, 63 + (i % 3) * 3, 8)}>
                    <MonoChip tone="confirm">paid</MonoChip>
                  </div>
                ) : null}
                <div
                  className={`relative w-[40px] rounded-t-sm ${
                    i === RULING_BAR
                      ? "bg-amber/80"
                      : slashed
                        ? "bg-nearwhite/15"
                        : "bg-nearwhite/40"
                  }`}
                  style={{ height }}
                >
                  {slashed && frame >= 57 ? (
                    <div
                      className="absolute left-1/2 top-1/2 h-[150%] w-[2px] bg-slash/80"
                      style={{ translate: "-50% -50%", rotate: "70deg", opacity: tw(frame, 57, 66, 0, 1) }}
                    />
                  ) : null}
                  {i === RULING_BAR ? (
                    <div
                      className="absolute -top-2 left-1/2 h-[2px] w-[52px] -translate-x-1/2 bg-amber"
                      style={{ opacity: tw(frame, 54, 60, 0, 1) }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="absolute font-mono text-xs text-amber" style={{ left: 150 + RULING_BAR * 72 + 20, top: BASE_Y + 10, translate: "-50% 0", opacity: tw(frame, 54, 60, 0, 1) }}>
          final_ruling · 1.000
        </div>
        <div className="absolute font-mono text-xs text-slash" style={{ left: 150 + NEAR_MISS_BAR * 72 + 20, top: BASE_Y + 10, translate: "-50% 0", opacity: tw(frame, 57, 65, 0, 1) }}>
          1.002 · slashed
        </div>

        {/* right panel — the tolerance band */}
        <div
          className="absolute rounded-sm border-y border-confirm/30 bg-confirm/10"
          style={{
            left: MEDIAN_X - BAND_HALF * tw(frame, 126, 138, 0, 1),
            width: BAND_HALF * tw(frame, 126, 138, 0, 1),
            top: 298, height: 64,
            opacity: bandOp,
          }}
        />
        <div
          className="absolute rounded-sm border-y border-confirm/30 bg-confirm/10"
          style={{
            left: MEDIAN_X,
            width: BAND_HALF * tw(frame, 131, 143, 0, 1),
            top: 298, height: 64,
            opacity: bandOp,
          }}
        />
        {/* band ticks */}
        {[MEDIAN_X - BAND_HALF, MEDIAN_X + BAND_HALF].map((x, i) => (
          <div key={i} className="absolute" style={{ left: x, top: 366, translate: "-50% 0", ...rise(frame, 138 + i * 3, 8) }}>
            <div className="flex flex-col items-center gap-0.5">
              <div className="h-2 w-[2px] bg-confirm" />
              <span className="font-mono text-[11px] text-confirm">{i === 0 ? "−1%" : "+1%"}</span>
            </div>
          </div>
        ))}
        <div className="absolute font-mono text-[11px] text-muted-foreground" style={{ left: MEDIAN_X, top: 396, translate: "-50% 0", opacity: tw(frame, 144, 152, 0, 1) }}>
          (tol_bps)
        </div>
        {/* number-line endpoint labels */}
        <div className="absolute font-mono text-[11px] text-muted-foreground" style={{ left: 760, top: 344, translate: "-50% 0", opacity: tw(frame, 72, 80, 0, 1) }}>0.97</div>
        <div className="absolute font-mono text-[11px] text-muted-foreground" style={{ left: 1280, top: 344, translate: "-50% 0", opacity: tw(frame, 72, 80, 0, 1) }}>1.03</div>

        {/* median flag */}
        <div className="absolute" style={{ left: MEDIAN_X, top: 246, translate: "-50% 0", ...rise(frame, 118, 9) }}>
          <MonoChip tone="amber">median = final tally</MonoChip>
        </div>

        {/* the vote dots */}
        {DOTS.map((off, i) => {
          const dotAt = 78 + i * 2;
          const x = MEDIAN_X + off;
          const yDrop = 270 + 60 * tw(frame, dotAt, dotAt + 11, 0, 1);
          const settle = 1 - 0.03 * Math.sin(Math.PI * lin(frame, dotAt + 9, dotAt + 14, 0, 1));
          const passed = frame >= passFrame(x);
          const inside = Math.abs(off) <= BAND_HALF;
          const isMedian = i === MEDIAN_DOT;
          const isBoundary = i === BOUNDARY_DOT;
          const ringP = isMedian ? lin(frame, 114, 129, 0, 1) : 0;
          const emph = isBoundary ? 1 + 0.15 * Math.sin(Math.PI * lin(frame, 159, 171, 0, 1)) : 1;
          return (
            <div key={i} className="absolute" style={{ left: x, top: yDrop, translate: "-50% -50%" }}>
              {isMedian && ringP > 0 && ringP < 1 ? (
                <div
                  className="absolute rounded-full border-2 border-amber"
                  style={{ inset: -8, translate: "-50% -50%", left: "50%", top: "50%", width: 44, height: 44, opacity: 1 - ringP, scale: String(0.6 + ringP * 0.8) }}
                />
              ) : null}
              <div
                className={`rounded-full ${
                  isMedian
                    ? "bg-amber"
                    : passed
                      ? inside
                        ? "bg-confirm"
                        : "bg-slash/80"
                      : "bg-nearwhite/70"
                }`}
                style={{
                  width: isMedian ? 14 : 12,
                  height: isMedian ? 14 : 12,
                  translate: "-50% -50%",
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  scale: String(settle * emph),
                  boxShadow: isMedian ? "0 0 12px var(--accord-amber)" : undefined,
                  opacity: tw(frame, dotAt, dotAt + 4, 0, 1),
                }}
              />
              {passed && !inside && !isMedian ? (
                <div
                  className="absolute h-[18px] w-[1.5px] bg-slash"
                  style={{ left: "50%", top: "50%", translate: "-50% -50%", rotate: "45deg", opacity: tw(frame, passFrame(x), passFrame(x) + 5, 0, 1) }}
                />
              ) : null}
              {passed && inside && !isMedian ? (
                <div
                  className="absolute font-mono text-[9px] text-confirm"
                  style={{ left: "50%", top: -14, translate: "-50% 0", opacity: tw(frame, passFrame(x), passFrame(x) + 5, 0, 1) }}
                >
                  +fee
                </div>
              ) : null}
            </div>
          );
        })}
        {/* boundary emphasis label */}
        <div
          className="absolute font-mono text-[11px] text-slash"
          style={{ left: MEDIAN_X + 76, top: 380, translate: "-50% 0", opacity: tw(frame, 159, 167, 0, 1) }}
        >
          just outside · 1.011
        </div>
        {/* the paid near-miss dot's value */}
        <div
          className="absolute font-mono text-[11px] text-confirm"
          style={{ left: MEDIAN_X + 14, top: 380, translate: "-50% 0", opacity: tw(frame, 150, 158, 0, 1) }}
        >
          1.002 · paid
        </div>

        {/* classification sweep */}
        {frame >= 144 && frame <= 162 ? (
          <div
            className="absolute rounded-sm border-x border-amber/40 bg-amber/10"
            style={{ left: sweepX - 18, top: 288, width: 36, height: 84, opacity: 0.9 }}
          />
        ) : null}

        {/* contrast chip on the connector */}
        <div className="absolute" style={{ left: 690, top: 212, translate: "-50% 0", ...pop(frame, 183, 9) }}>
          <MonoChip tone="neutral">same distance — different outcome</MonoChip>
        </div>

        {/* formula chip, persistent */}
        <div className="absolute" style={{ left: 1000, top: 470, translate: "-50% 0", ...pop(frame, 12, 9) }}>
          <MonoChip tone="amber">|vote − final_ruling|·10⁴ ≤ final_ruling·tol_bps</MonoChip>
        </div>
      </div>
    </ConceptScene>
  );
}
