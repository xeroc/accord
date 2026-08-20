import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";

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
        <div key={t.sym} className="flex items-baseline gap-3">
          <span className="text-nearwhite">{t.sym}</span>
          <span className="text-body">{t.val}</span>
          <span
            className={t.chg.startsWith("+") ? "text-confirm" : "text-slash"}
          >
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
    <div className="relative h-full w-full">
      <Backdrop seed="gap" />
      <div className="relative flex h-full flex-col items-center justify-center gap-12 px-24">
        <Interactive.Div
          name="Price ticker"
          className="w-full overflow-hidden border-b border-border-subtle pb-5"
          style={{
            opacity: interpolate(
              frame,
              [0, 0.3 * fps, 2 * fps, 2.4 * fps],
              [0, 1, 1, 0.35],
              {
                easing: [EASE_EXPO, Easing.linear, EASE_EXPO],
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
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
                {
                  easing: [Easing.linear, Easing.linear],
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
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
            opacity: interpolate(frame, [1 * fps, 1.5 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [1 * fps, 1.5 * fps],
              ["0px 24px", "0px 0px"],
              {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            ),
          }}
        >
          Blockchains know prices.
        </Interactive.Div>

        <Interactive.Div
          name="Gap subheadline"
          className="text-center font-heading text-6xl font-medium text-text-secondary"
          style={{
            opacity: interpolate(frame, [1.6 * fps, 2.1 * fps], [0, 1], {
              easing: EASE_EXPO,
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          They can&apos;t tell you{" "}
          <span className="text-amber">what happened.</span>
        </Interactive.Div>

        <div className="flex gap-6 font-mono text-2xl">
          <Interactive.Div
            name="Question work"
            className="rounded-lg border border-border-subtle bg-raised px-6 py-3 text-text-secondary"
            style={{
              opacity: interpolate(frame, [2.4 * fps, 2.8 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [2.4 * fps, 2.8 * fps],
                ["0px 14px", "0px 0px"],
                {
                  easing: EASE_EXPO,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            was the work delivered?
          </Interactive.Div>
          <Interactive.Div
            name="Question token"
            className="rounded-lg border border-border-subtle bg-raised px-6 py-3 text-text-secondary"
            style={{
              opacity: interpolate(frame, [2.75 * fps, 3.15 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [2.75 * fps, 3.15 * fps],
                ["0px 14px", "0px 0px"],
                {
                  easing: EASE_EXPO,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            is this token real?
          </Interactive.Div>
          <Interactive.Div
            name="Question claim"
            className="rounded-lg border border-border-subtle bg-raised px-6 py-3 text-text-secondary"
            style={{
              opacity: interpolate(frame, [3.1 * fps, 3.5 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [3.1 * fps, 3.5 * fps],
                ["0px 14px", "0px 0px"],
                {
                  easing: EASE_EXPO,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            should this claim pay?
          </Interactive.Div>
        </div>
      </div>
    </div>
  );
}
