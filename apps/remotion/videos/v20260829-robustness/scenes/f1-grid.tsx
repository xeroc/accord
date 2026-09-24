import { useCurrentFrame } from "remotion";

import { MonoChip, PanelLadder, TokenBadge } from "@useaccord/ui";
import { ArcToken, ConceptScene, breath, draw, pop, rise, stepped, tw } from "./chrome";

/**
 * F1 — the (round_idx, draw_attempt) grid.
 *
 * Two orthogonal counters, two different costs: X = round_idx (the
 * appeal axis — panel grows, a bond burns), Y = draw_attempt (the
 * redraw axis — same panel, no-shows slashed). One dispute walks the
 * grid down then right to the appeals-exhausted terminal; a ghost
 * replay runs the attempts-exhausted terminal and refunds the filer.
 */

const CW = 190;
const CH = 180;
const GX = 310;
const GY = 80;
const colX = (r: number) => GX + r * CW + CW / 2;
const rowY = (a: number) => GY + a * CH + CH / 2;

const PANELS = [3, 7, 15];

/** dot-grid geometry per panel size (mirrors the kit's cluster rule) */
function clusterCols(count: number): number {
  return count <= 3 ? 3 : count <= 7 ? 4 : 8;
}

function PanelCluster({
  frame,
  count,
  at,
  slashAt,
}: {
  frame: number;
  count: number;
  at: number;
  slashAt?: number;
}) {
  const cols = clusterCols(count);
  const scale = tw(frame, at, at + 8, 0.6, 1);
  const op = tw(frame, at, at + 8, 0, 1);
  return (
    <div
      className="flex flex-wrap content-center justify-center"
      style={{
        width: cols * 14,
        gap: 6,
        opacity: op,
        transform: `scale(${scale})`,
      }}
    >
      {Array.from({ length: count }, (_, d) => {
        const dotAt = at + Math.floor((d * 5) / count);
        const dotOp = tw(frame, dotAt, dotAt + 3, 0, 1);
        const slashed =
          slashAt !== undefined && d < 2 && frame >= slashAt;
        return (
          <div
            key={d}
            className={`relative rounded-full ${slashed ? "bg-slash/70" : "bg-nearwhite/70"}`}
            style={{ width: 8, height: 8, opacity: dotOp }}
          >
            {slashed ? (
              <div
                className="absolute left-1/2 top-1/2 h-[14px] w-[1.5px] bg-slash"
                style={{ translate: "-50% -50%", rotate: "45deg" }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** the dispute token — a small amber diamond */
function Token({
  x,
  y,
  opacity,
  scale,
  ghost = false,
}: {
  x: number;
  y: number;
  opacity: number;
  scale: number;
  ghost?: boolean;
}) {
  return (
    <div
      className={`absolute rounded-[3px] ${
        ghost ? "border border-dashed border-amber/70 bg-amber/10" : "bg-amber"
      }`}
      style={{
        left: x,
        top: y,
        width: 18,
        height: 18,
        translate: "-50% -50%",
        rotate: "45deg",
        opacity,
        scale: String(scale),
        boxShadow: ghost ? undefined : "0 0 14px var(--accord-amber)",
      }}
    />
  );
}

const MAIN_PATH = [
  { at: 48, x: colX(0), y: rowY(0) },
  { at: 95, x: colX(0), y: rowY(1) }, // redraw ↓
  { at: 135, x: colX(1), y: rowY(1) }, // appeal 1 →
  { at: 175, x: colX(2), y: rowY(1) }, // appeal 2 →
  { at: 197, x: 985, y: rowY(1) }, // exit right → terminal plate
];

const GHOST_PATH = [
  { at: 222, x: colX(1), y: rowY(1) },
  { at: 249, x: colX(1), y: rowY(2) }, // redraw ↓ (tie)
  { at: 267, x: colX(1), y: 700 }, // redraw ↓ (shortfall) → exit bottom
];

export function F1GridScene() {
  const frame = useCurrentFrame();
  const main = stepped(frame, MAIN_PATH);
  const ghost = stepped(frame, GHOST_PATH);
  const mainBorn = tw(frame, 48, 58, 0, 1);
  const plateBreathR = 1 + 0.015 * (breath(frame, 120) - 0.5);
  const plateBreathB = 1 + 0.015 * (breath(frame, 120, Math.PI) - 0.5);

  return (
    <ConceptScene
      seed="robustness-f1"
      kicker="TWO AXES, TWO COSTS"
      title="round_idx × draw_attempt"
      caption="appeals exhaust into a Ruling · exhausted draws fail into a refund"
    >
      <div className="relative" style={{ width: 1240, height: 790 }}>
        {/* axes */}
        <svg className="absolute inset-0 h-full w-full text-muted-foreground" viewBox="0 0 1240 790" fill="none">
          <line
            x1={300} y1={70} x2={300} y2={628}
            stroke="currentColor" strokeWidth={1.5} pathLength={1}
            strokeDasharray={1} strokeDashoffset={draw(frame, 3, 12)}
          />
          <line
            x1={300} y1={630} x2={888} y2={630}
            stroke="currentColor" strokeWidth={1.5} pathLength={1}
            strokeDasharray={1} strokeDashoffset={draw(frame, 9, 12)}
          />
          <polygon points="300,640 294,626 306,626" fill="currentColor" opacity={tw(frame, 14, 20, 0, 1)} />
          <polygon points="898,630 884,624 884,636" fill="currentColor" opacity={tw(frame, 20, 26, 0, 1)} />
        </svg>
        <div
          className="absolute font-mono text-sm text-text-secondary"
          style={{ left: 595, top: 648, translate: "-50% 0", ...rise(frame, 15, 9) }}
        >
          round_idx → appeal
        </div>
        <div
          className="absolute font-mono text-sm text-text-secondary"
          style={{
            left: 258, top: 350, translate: "-50% -50%", rotate: "-90deg", ...rise(frame, 18, 9),
          }}
        >
          draw_attempt ↓ redraw
        </div>

        {/* column headers — panel(r) */}
        {PANELS.map((p, r) => (
          <div
            key={r}
            className="absolute font-mono text-sm text-muted-foreground"
            style={{ left: colX(r), top: 40, translate: "-50% 0", ...rise(frame, 20 + r * 3, 8) }}
          >
            panel {p}
          </div>
        ))}

        {/* cells + clusters */}
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((a) => (
            <div
              key={`${r}-${a}`}
              className="absolute rounded-md border border-border-subtle/60 bg-raised/25"
              style={{
                left: GX + r * CW + 10,
                top: GY + a * CH + 10,
                width: CW - 20,
                height: CH - 20,
                opacity: tw(frame, 12 + r * 3, 24 + r * 3, 0, 1),
              }}
            >
              <div className="flex h-full items-center justify-center">
                <PanelCluster
                  frame={frame}
                  count={PANELS[r] ?? 3}
                  at={18 + r * 7}
                  slashAt={r === 0 && a === 0 ? 60 : undefined}
                />
              </div>
            </div>
          )),
        )}

        {/* filer glyph (refund home) */}
        <div
          className="absolute flex items-center gap-2 rounded-lg border border-border-subtle bg-raised/60 px-3 py-2"
          style={{ left: 108, top: 108, ...rise(frame, 24, 9) }}
        >
          <span className="h-2 w-2 rounded-full bg-nearwhite" />
          <span className="font-mono text-sm text-text-secondary">filer</span>
        </div>
        {/* receipt */}
        <div className="absolute" style={{ left: 96, top: 158, ...pop(frame, 285, 9) }}>
          <MonoChip tone="confirm">+ refund</MonoChip>
        </div>

        {/* right terminal plate — appeals exhausted */}
        <div
          className="absolute flex w-[270px] flex-col items-center gap-2 rounded-xl border border-confirm/40 bg-confirm/10 px-4 py-4"
          style={{
            left: 930, top: 292, scale: String(plateBreathR), ...rise(frame, 30, 10),
          }}
        >
          <div className="font-mono text-sm text-text-secondary">appeals exhausted</div>
          <svg width={30} height={26} viewBox="0 0 30 26" className="text-confirm" fill="none">
            <polyline
              points="4,14 11,21 26,5" stroke="currentColor" strokeWidth={3}
              strokeLinecap="square" pathLength={1} strokeDasharray={1}
              strokeDashoffset={draw(frame, 205, 10)}
            />
          </svg>
          <div className="font-mono text-sm text-confirm">Ruling stands</div>
        </div>

        {/* bottom terminal plate — attempts exhausted */}
        <div
          className="absolute flex w-[270px] flex-col items-center gap-1.5 rounded-xl border border-slash/40 bg-slash/10 px-4 py-3"
          style={{
            left: 460, top: 668, scale: String(plateBreathB), ...rise(frame, 33, 10),
          }}
        >
          <div className="font-mono text-sm text-text-secondary">attempts exhausted</div>
          <MonoChip tone="slash">Failed</MonoChip>
        </div>

        {/* step chips */}
        <div className="absolute" style={{ left: 430, top: 236, ...pop(frame, 66, 8) }}>
          <MonoChip tone="slash">plurality tie</MonoChip>
        </div>
        <div className="absolute" style={{ left: 210, top: 455, ...pop(frame, 100, 8) }}>
          <MonoChip tone="neutral">draw_attempt +1 · panel unchanged</MonoChip>
        </div>
        <div className="absolute" style={{ left: 508, top: 300, ...pop(frame, 120, 8) }}>
          <TokenBadge frame={frame} tone="fee" amount="2×" label="bond" at={120} />
        </div>
        <div className="absolute" style={{ left: 648, top: 396, ...pop(frame, 141, 8) }}>
          <MonoChip tone="amber">panel 3 → 7 · attempt → 0</MonoChip>
        </div>
        <div className="absolute" style={{ left: 700, top: 300, ...pop(frame, 160, 8) }}>
          <TokenBadge frame={frame} tone="fee" amount="4×" label="bond" at={160} />
        </div>
        <div className="absolute" style={{ left: 828, top: 396, ...pop(frame, 181, 8) }}>
          <MonoChip tone="amber">panel 7 → 15</MonoChip>
        </div>
        <div className="absolute" style={{ left: 512, top: 448, ...pop(frame, 230, 8) }}>
          <MonoChip tone="slash">tie</MonoChip>
        </div>
        <div className="absolute" style={{ left: 512, top: 604, ...pop(frame, 248, 8) }}>
          <MonoChip tone="slash">quorum shortfall</MonoChip>
        </div>

        {/* the appeal ladder legend */}
        <div className="absolute" style={{ left: 24, top: 648 }}>
          <div className="mb-1 font-mono text-xs text-muted-foreground" style={rise(frame, 36, 8)}>
            the appeal ladder
          </div>
          <PanelLadder
            frame={frame}
            steps={PANELS}
            at={40}
            stagger={12}
            labels={["bond ×1", "×2", "×4"]}
            stepHeight={13}
            dotSize={5}
          />
        </div>

        {/* the walking dispute */}
        <div
          className="absolute font-mono text-xs text-amber"
          style={{ left: colX(0), top: 128, translate: "-50% 0", opacity: tw(frame, 50, 58, 0, 1) * tw(frame, 96, 106, 1, 0) }}
        >
          one dispute
        </div>
        <Token x={main.x} y={main.y} opacity={mainBorn} scale={0.7 + mainBorn * 0.3} />
        {/* ghost replay — the alternate terminal */}
        <Token
          x={ghost.x}
          y={ghost.y}
          opacity={0.6 * tw(frame, 222, 230, 0, 1)}
          scale={0.9}
          ghost
        />
        {/* refund flight: Failed plate → filer */}
        <ArcToken
          frame={frame}
          tone="confirm"
          from={{ x: 595, y: 700 }}
          to={{ x: 168, y: 132 }}
          lift={-110}
          at={272}
          dur={18}
        />
      </div>
    </ConceptScene>
  );
}
