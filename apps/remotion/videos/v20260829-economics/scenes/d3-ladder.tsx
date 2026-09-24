import { useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { AppealCostCurve, PanelLadder } from "@useaccord/ui";

import { CoinStack, ConceptChrome } from "./pieces";

/**
 * D3 · The appeal ladder — exponential anti-bribery. PanelLadder's
 * compressing entrances (the tempo IS the exponent) climb 3 → 7 → 15
 * while the bond stacks double 2 → 4 → 8 → 16; then the hero beat:
 * the kit AppealCostCurve draws over the staircase — slow crawl,
 * explosive rise crossing the "value of capturing the ruling" line
 * with a flash + ✕, and exiting the top. Two exhaustion facts close.
 */

/**
 * The kit curve's coordinate frame: a 560x500 box, baseline (the
 * ladder's floor) at local y = 470. Placing the box at top 90 keeps
 * the baseline at canvas y 560 and the curve peak at y 120 — the
 * original D3 framing, now fully inside the box (no overflow).
 */
const BOX_W = 560;
const BOX_H = 500;
const BASELINE = 470;
const LADDER_LEFT = 88;

const STACKS: readonly { count: number; at: number; left: number }[] = [
  { count: 2, at: 26, left: LADDER_LEFT + 48 - 11 },
  { count: 4, at: 48, left: LADDER_LEFT + 144 - 11 },
  { count: 8, at: 72, left: LADDER_LEFT + 240 - 11 },
  { count: 16, at: 97, left: LADDER_LEFT + 336 - 11 },
];

export function D3LadderScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const caption = (at: number) => ({
    opacity: enterAt(frame, fps, at / fps, 8 / fps),
    transform: `translateY(${(1 - enterAt(frame, fps, at / fps, 8 / fps)) * -10}px)`,
  });

  return (
    <Scene seed="econ-d3">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={2}
        headline="the appeal ladder"
        sub="each rung doubles the bond — the price of capture compounds past the prize"
      />

      {/* ladder + curve share one coordinate frame */}
      <div className="absolute" style={{ left: 680, top: 90, width: BOX_W, height: BOX_H }}>
        <AppealCostCurve frame={frame} at={112} className="absolute inset-0" />

        {/* the ladder (bottom edge on the baseline) */}
        <div className="absolute" style={{ left: LADDER_LEFT, bottom: BOX_H - BASELINE }}>
          <PanelLadder
            frame={frame}
            at={12}
            stagger={26}
            labels={["3 · ×1 (B)", "7 · ×2 (2B)", "15 · ×4 (4B)", "31 · ×8 (8B)"]}
            stepHeight={46}
            dotSize={9}
          />
        </div>

        {/* bond stacks double beside each rung */}
        {STACKS.map((s) => (
          <CoinStack
            key={s.count}
            frame={frame}
            fps={fps}
            at={s.at}
            count={s.count}
            style={{ left: s.left, top: 512 }}
          />
        ))}
      </div>

      {/* the two exhaustion facts */}
      <div className="absolute flex gap-8" style={{ left: 960, top: 872, translate: "-50% 0" }}>
        <div
          className="rounded-lg border border-border-subtle bg-raised px-5 py-3 font-mono text-sm text-text-secondary"
          style={caption(178)}
        >
          appeal budget exhausted → <span className="text-confirm">the ruling stands</span>
        </div>
        <div
          className="rounded-lg border border-border-subtle bg-raised px-5 py-3 font-mono text-sm text-text-secondary"
          style={caption(192)}
        >
          appeal flips the ruling → <span className="text-amber">bond refunded</span>
        </div>
      </div>
    </Scene>
  );
}
