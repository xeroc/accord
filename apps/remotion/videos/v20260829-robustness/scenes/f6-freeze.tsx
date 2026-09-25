import { useCurrentFrame } from "remotion";

import {
  MonoChip,
  RulingStamp,
  SubaccordCard,
} from "@useaccord/ui";
import { ArcToken, ConceptScene, breath, draw, lin, pop, rise, tw } from "./chrome";

/**
 * F6 — CaseTerms freeze.
 *
 * The Subaccord control panel is photographed at filing: a snapshot of
 * every mechanism parameter staples onto the Dispute and never moves.
 * Later dial-turns pass through the 48 h authority timelock and reach
 * only a queue of future filings; the identity set is welded shut.
 * "Can governance change my dispute mid-flight?" — no.
 */

const DIALS = [
  "windows",
  "aggregation",
  "appeal_window",
  "reveal_threshold_bps",
  "coherence_tol_bps",
  "ladder",
] as const;
const LIVE_DIAL = 2;

function Dial({
  frame,
  at,
  angle,
  size = 52,
  live = false,
}: {
  frame: number;
  at: number;
  angle: number;
  size?: number;
  live?: boolean;
}) {
  const p = tw(frame, at, at + 9, 0, 1);
  const r = size / 2;
  return (
    <div className="flex flex-col items-center gap-1" style={{ opacity: p, transform: `scale(${0.7 + p * 0.3})` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <circle
          cx={r} cy={r} r={r - 3}
          className={live ? "text-amber/70" : "text-border-subtle"} stroke="currentColor" strokeWidth={2}
        />
        <g transform={`rotate(${angle} ${r} ${r})`}>
          <line
            x1={r} y1={r} x2={r} y2={7}
            className={live ? "text-amber" : "text-nearwhite/70"} stroke="currentColor" strokeWidth={2.5} strokeLinecap="square"
          />
        </g>
        <circle cx={r} cy={r} r={2.5} className="text-nearwhite/70" fill="currentColor" />
      </svg>
    </div>
  );
}

function MiniDials({ frame, at }: { frame: number; at: number }) {
  return (
    <div className="flex items-center gap-3">
      {DIALS.map((_, i) => {
        const p = tw(frame, at + i * 2, at + i * 2 + 6, 0, 1);
        return (
          <svg key={i} width={26} height={26} viewBox="0 0 26 26" fill="none" style={{ opacity: p }}>
            <circle cx={13} cy={13} r={10} className="text-border-subtle" stroke="currentColor" strokeWidth={1.5} />
            <g transform={`rotate(${[0, 40, 15, 70, 25, 55][i] ?? 0} 13 13)`}>
              <line x1={13} y1={13} x2={13} y2={4} className="text-nearwhite/80" stroke="currentColor" strokeWidth={1.8} strokeLinecap="square" />
            </g>
          </svg>
        );
      })}
    </div>
  );
}

/** the frozen snapshot flying from the live panel onto the Dispute */
function FlyingSnapshot({ frame }: { frame: number }) {
  if (frame < 52 || frame > 68) {
    return null;
  }
  const t = lin(frame, 52, 67, 0, 1);
  const eased = tw(frame, 52, 67, 0, 1);
  const x = 340 + (1040 - 340) * eased;
  const y = 240 + (300 - 240) * eased - 90 * Math.sin(Math.PI * t);
  const s = 1 + 0.06 * Math.sin(Math.PI * t);
  return (
    <div
      className="absolute rounded-lg border-2 border-amber/70 bg-raised px-3 py-2"
      style={{
        left: x, top: y, translate: "-50% -50%", scale: String(s),
        opacity: tw(frame, 52, 55, 0, 1) * tw(frame, 65, 68, 1, 0),
        boxShadow: "0 0 18px var(--accord-amber)",
      }}
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((d) => (
          <div key={d} className="h-3 w-3 rounded-full border border-nearwhite/60" />
        ))}
      </div>
      <div className="mt-1 font-mono text-[9px] text-text-secondary">CaseTerms</div>
    </div>
  );
}

export function F6FreezeScene() {
  const frame = useCurrentFrame();
  // the live appeal_window dial: anticipation, then a 60° turn
  const liveAngle =
    4 * Math.sin(Math.PI * lin(frame, 93, 96, 0, 1)) + tw(frame, 96, 108, 0, 60);
  // the wrench on the welded dial: 8° turn, two firm decaying oscillations, slip
  const wrenchT = lin(frame, 189, 204, 0, 1);
  const weldAngle =
    frame < 189
      ? tw(frame, 183, 189, 0, 8)
      : 8 * Math.cos(4 * Math.PI * wrenchT) * (1 - wrenchT);
  const flashOp = tw(frame, 48, 50, 0, 0.35) * tw(frame, 50, 53, 1, 0);
  const lockPulse = lin(frame, 138, 150, 0, 1);
  const glintX = 90 + lin(frame, 210, 221, 0, 520);
  const sheenX = 790 + lin(frame, 276, 306, 0, 480);
  const queueBreath = breath(frame, 150, 2.1);

  return (
    <ConceptScene
      seed="robustness-f6"
      kicker="CASETERMS FREEZE"
      title="the rules were photographed at filing"
      caption="governance turns future filings through a 48 h timelock · your dispute never moves"
    >
      <div className="relative" style={{ width: 1400, height: 680 }}>
        {/* the live Subaccord control panel */}
        <div className="absolute" style={{ left: 70, top: 56 }}>
          <SubaccordCard frame={frame} title="subaccord · live terms" at={0} className="w-[540px]">
            <div className="grid grid-cols-3 gap-x-8 gap-y-4">
              {DIALS.map((d, i) => (
                <div key={d} className="flex flex-col items-center gap-1">
                  <Dial frame={frame} at={6 + i * 2} angle={i === LIVE_DIAL ? liveAngle : [20, 55, 0, 80, 35, 65][i] ?? 20} live={i === LIVE_DIAL} />
                  <div className={`font-mono text-[10px] ${i === LIVE_DIAL ? "text-amber" : "text-muted-foreground"}`}>{d}</div>
                </div>
              ))}
            </div>
          </SubaccordCard>
          {/* camera flash at filing */}
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-nearwhite" style={{ opacity: flashOp }} />
          {/* panel LED */}
          <div
            className="absolute h-2 w-2 rounded-full bg-amber"
            style={{ right: 18, top: 14, opacity: 0.4 + 0.6 * breath(frame, 120) }}
          />
        </div>

        {/* timelock badge + rotating ring */}
        <div className="absolute" style={{ left: 90, top: 296, ...pop(frame, 18, 8) }}>
          <div className="flex items-center gap-2">
            <svg width={22} height={22} viewBox="0 0 22 22" fill="none">
              <circle cx={11} cy={11} r={8} className="text-amber/40" stroke="currentColor" strokeWidth={2} />
              <g transform={`rotate(${tw(frame, 108, 120, 0, 360)} 11 11)`}>
                <line x1={11} y1={3} x2={11} y2={8} className="text-amber" stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
              </g>
            </svg>
            <MonoChip tone="amber">authority timelock · 48 h</MonoChip>
          </div>
        </div>
        <div className="absolute" style={{ left: 90, top: 334, ...pop(frame, 114, 8) }}>
          <MonoChip tone="neutral">queued · future filings only</MonoChip>
        </div>

        {/* the welded identity sub-plate */}
        <div
          className="absolute rounded-lg border-2 border-border-subtle bg-ink px-5 py-4"
          style={{ left: 70, top: 462, width: 540, ...rise(frame, 21, 10) }}
        >
          <div className="absolute left-3 top-3 h-1.5 w-1.5 rounded-full bg-border-subtle" />
          <div className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-border-subtle" />
          <div className="absolute bottom-3 left-3 h-1.5 w-1.5 rounded-full bg-border-subtle" />
          <div className="absolute bottom-3 right-3 h-1.5 w-1.5 rounded-full bg-border-subtle" />
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs tracking-[0.2em] text-muted-foreground">identity set — immutable</div>
            <svg width={18} height={18} viewBox="0 0 18 18" className="text-nearwhite/60" fill="none">
              <rect x={3} y={7} width={12} height={8} rx={2} stroke="currentColor" strokeWidth={1.8} />
              <path d="M5 7 V5 A4 4 0 0 1 13 5 V7" stroke="currentColor" strokeWidth={1.8} />
            </svg>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <div className="relative">
              <Dial frame={frame} at={24} angle={weldAngle} size={40} />
              {/* the wrench */}
              {frame >= 171 && frame <= 212 ? (
                <svg
                  width={40} height={40} viewBox="0 0 40 40" className="absolute text-text-secondary" fill="none"
                  style={{
                    left: tw(frame, 171, 183, -70, 0),
                    top: tw(frame, 171, 183, -20, 0) + tw(frame, 204, 210, 0, 26),
                    opacity: tw(frame, 171, 177, 0, 1) * tw(frame, 207, 212, 1, 0),
                    rotate: `${tw(frame, 183, 189, 0, 25)}deg`,
                  }}
                >
                  <circle cx={14} cy={26} r={7} stroke="currentColor" strokeWidth={3} strokeDasharray="9 5" />
                  <line x1={19} y1={21} x2={34} y2={6} stroke="currentColor" strokeWidth={3.5} strokeLinecap="square" />
                </svg>
              ) : null}
            </div>
            <div className="font-mono text-[11px] text-slash/80" style={{ opacity: tw(frame, 204, 212, 0, 1) }}>
              nothing to turn
            </div>
          </div>
          {/* weld-seam glint */}
          {frame >= 210 && frame <= 222 ? (
            <div
              className="pointer-events-none absolute top-0 h-full w-16 bg-nearwhite/10"
              style={{ left: glintX - 70, opacity: 0.6 }}
            />
          ) : null}
        </div>

        {/* queue of future filings */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute flex items-center gap-2 rounded-lg border border-border-subtle bg-raised/50 px-3 py-2"
            style={{
              left: 88 + i * 180, top: 372, ...pop(frame, 120 + i * 4, 9),
              translate: `0px ${(2 * (queueBreath - 0.5) * (i + 1)) / 3}px`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber/70" />
            <span className="font-mono text-[11px] text-text-secondary">future filing</span>
          </div>
        ))}

        {/* the arbitrable + create_dispute token */}
        <div
          className="absolute flex items-center gap-2 rounded-lg border border-border-subtle bg-raised/60 px-3 py-2"
          style={{ left: 640, top: 56, ...rise(frame, 8, 9) }}
        >
          <span className="h-2 w-2 rounded-sm bg-nearwhite/70" />
          <span className="font-mono text-xs text-text-secondary">arbitrable</span>
        </div>
        <ArcToken frame={frame} tone="fee" from={{ x: 700, y: 84 }} to={{ x: 340, y: 200 }} lift={-30} at={33} dur={12} size={10} />
        <div className="absolute" style={{ left: 420, top: 148, ...pop(frame, 36, 8) }}>
          <MonoChip tone="amber">create_dispute</MonoChip>
        </div>

        {/* the Dispute card */}
        <div
          className="absolute flex flex-col items-center gap-5 rounded-2xl border border-border-subtle bg-raised/60 px-8 py-6"
          style={{ left: 760, top: 120, width: 560, minHeight: 420, ...rise(frame, 15, 12) }}
        >
          <div className="font-mono text-sm tracking-[0.25em] text-text-secondary">Dispute #0114</div>
          <div
            className="font-mono text-xs text-muted-foreground"
            style={{ opacity: tw(frame, 24, 32, 0, 0.7) * tw(frame, 48, 56, 1, 0) }}
          >
            no CaseTerms yet
          </div>

          {/* the stapled snapshot */}
          <div className="relative flex flex-col items-center gap-2">
            <div
              className="flex flex-col items-center gap-2 rounded-lg border-2 border-amber/60 bg-ink px-5 py-4"
              style={pop(frame, 64, 10)}
            >
              <MiniDials frame={frame} at={67} />
              <div className="font-mono text-[10px] text-text-secondary">CaseTerms · frozen @ create_dispute</div>
              {/* staples */}
              <div className="absolute -top-2 left-6 h-3.5 w-[3px] bg-nearwhite" style={pop(frame, 64, 5)} />
              <div className="absolute -top-2 right-6 h-3.5 w-[3px] bg-nearwhite" style={pop(frame, 65, 5)} />
              {/* sheen — premium accent, once */}
              {frame >= 276 && frame <= 308 ? (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                  <div className="absolute top-0 h-full w-20 bg-nearwhite/10" style={{ left: sheenX - 820 }} />
                </div>
              ) : null}
            </div>
            {/* lock ring pulse — the frozen copy does not move */}
            {lockPulse > 0 && lockPulse < 1 ? (
              <div
                className="pointer-events-none absolute inset-0 rounded-xl border-2 border-confirm/60"
                style={{ opacity: 1 - lockPulse, scale: String(1 + lockPulse * 0.25) }}
              />
            ) : null}
          </div>

          <RulingStamp frame={frame} text="RULING" at={234} size="md" />
          <div
            className="font-mono text-xs text-text-secondary"
            style={{ opacity: tw(frame, 252, 262, 0, 1) }}
          >
            your dispute&rsquo;s rules were fixed at filing
          </div>
        </div>

        {/* blocked propagation arrow + X */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1400 680" fill="none">
          <line
            x1={545} y1={140} x2={874} y2={268}
            className="text-slash/50" stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 6"
            pathLength={1} strokeDashoffset={draw(frame, 150, 8)}
          />
          <g className="text-slash" opacity={tw(frame, 156, 162, 0, 1)}>
            <line x1={866} y1={262} x2={886} y2={282} stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
            <line x1={886} y1={262} x2={866} y2={282} stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
          </g>
        </svg>

        <FlyingSnapshot frame={frame} />
      </div>
    </ConceptScene>
  );
}
