import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { MonoChip } from "../../../src/pieces/chips";
import { Scene } from "../../../src/shell/scene";

const TICKER = [
  { sym: "SOL/USD", val: "214.52", chg: "+1.2%" },
  { sym: "JUP/USD", val: "0.8410", chg: "-0.3%" },
  { sym: "WBTC/USD", val: "97410.00", chg: "+0.4%" },
  { sym: "USDC/USD", val: "1.0000", chg: "+0.0%" },
  { sym: "JTO/USD", val: "3.9210", chg: "+0.8%" },
  { sym: "PYTH/USD", val: "0.4120", chg: "+1.1%" },
  { sym: "WIF/USD", val: "2.1800", chg: "-0.9%" },
  { sym: "BONK/USD", val: "0.0000281", chg: "-2.1%" },
];

function TickerCopy() {
  return (
    <div className="flex w-[1920px] items-center justify-around">
      {TICKER.map((t) => (
        <div key={t.sym} className="flex items-baseline gap-3 font-mono text-xl">
          <span className="text-nearwhite">{t.sym}</span>
          <span className="text-body">{t.val}</span>
          <span className={t.chg.startsWith("+") ? "text-confirm" : "text-slash"}>
            {t.chg}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Scene 1 — the gap (0s-5s).
 * A price ticker scrolls, freezes and dims. Blockchains know prices;
 * they can't tell you what happened. Three unanswered questions stamp in.
 */
export function GapScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="gap" stack className="gap-12 px-24">
      <Interactive.Div
        name="Price ticker"
        className="w-full overflow-hidden border-b border-border-subtle pb-5"
        style={{
          opacity: interpolate(
            frame,
            [0, 0.3 * fps, 2 * fps, 2.4 * fps],
            [0, 1, 1, 0.35],
            { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
          ),
        }}
      >
        <div
          className="flex w-[3840px] font-mono text-xl"
          style={{
            translate: interpolate(
              frame,
              [0, 2 * fps, 5 * fps],
              ["0px 0px", "-768px 0px", "-768px 0px"],
              { easing: [Easing.linear, Easing.linear], ...clamp },
            ),
          }}
        >
          <TickerCopy />
          <TickerCopy />
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Gap headline"
        className="text-center font-heading text-8xl font-bold tracking-tight text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 1, 0.5),
          translate: `0px ${(1 - enterAt(frame, fps, 1, 0.5)) * 24}px`,
        }}
      >
        Blockchains know prices.
      </Interactive.Div>

      <Interactive.Div
        name="Gap subheadline"
        className="text-center font-heading text-6xl font-medium text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 1.6, 0.5) }}
      >
        They can&apos;t tell you <span className="text-amber">what happened.</span>
      </Interactive.Div>

      <div className="flex gap-6 font-mono text-2xl">
        {[
          { q: "was the work delivered?", at: 2.4 },
          { q: "is this token real?", at: 2.75 },
          { q: "should this claim pay?", at: 3.1 },
        ].map(({ q, at }) => (
          <Interactive.Div key={q} name={`Question ${q}`} style={{ opacity: enterAt(frame, fps, at, 0.4), translate: `0px ${(1 - enterAt(frame, fps, at, 0.4)) * 14}px` }}>
            <MonoChip tone="neutral" className="rounded-lg px-6 py-3 text-2xl">
              {q}
            </MonoChip>
          </Interactive.Div>
        ))}
      </div>
    </Scene>
  );
}
