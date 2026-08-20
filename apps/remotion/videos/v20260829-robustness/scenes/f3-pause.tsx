import { useCurrentFrame } from "remotion";

import { MonoChip } from "@useaccord/ui";
import { ConceptScene, draw, lin, pop, rise, tw } from "./chrome";

/**
 * F3 — pause scope split.
 *
 * The operational switch is small on purpose: pause gates exactly the
 * two intake instructions (`create_dispute`, `stake`) through shutoff
 * valves, while the adjudication channel — appeal · commit · reveal ·
 * finalize · unstake — keeps flowing, because it has no valve to
 * close. The feared smother attack is shown reaching for a valve
 * mount that is not there.
 */

const PIPE_Y = { create: 170, stake: 310 } as const;
const VALVE_X = 430;
const CHANNEL = { x0: 620, x1: 1360, y0: 240, y1: 400 } as const;
const FLOW_Y = 300;
const STATION_X = [690, 830, 970, 1110, 1250] as const;
const STATIONS = ["appeal", "commit", "reveal", "finalize", "unstake"] as const;

/** valve state: closed in [CLOSED_AT, OPEN_AT) */
const LEVER_AT = 42;
const CLOSED_AT = 48;
const OPEN_AT = 201;

interface IntakePos {
  x: number;
  halted: boolean;
}

/** deterministic intake-token travel with a valve clamp window */
function intakePos(frame: number, spawn: number): IntakePos | null {
  const speed = 5;
  const start = 80;
  const valve = VALVE_X - 6;
  const reach = spawn + (valve - start) / speed;
  if (frame < spawn) {
    return null;
  }
  const naive = start + (frame - spawn) * speed;
  const gated = reach >= CLOSED_AT && reach < OPEN_AT;
  if (!gated) {
    return { x: Math.min(naive, 566), halted: false };
  }
  if (frame < reach) {
    return { x: naive, halted: false };
  }
  if (frame < OPEN_AT) {
    return { x: valve, halted: true };
  }
  return { x: Math.min(valve + (frame - OPEN_AT) * speed, 566), halted: false };
}

function IntakeDot({ frame, spawn, y }: { frame: number; spawn: number; y: number }) {
  const pos = intakePos(frame, spawn);
  if (!pos) {
    return null;
  }
  // halted dots fade ~4f after arriving at the clamp
  const haltFade = pos.halted
    ? tw(frame, spawn + (VALVE_X - 86) / 5, spawn + (VALVE_X - 86) / 5 + 9, 1, 0)
    : 1;
  return (
    <div
      className="absolute h-2.5 w-2.5 rounded-full bg-nearwhite"
      style={{ left: pos.x, top: y, translate: "-50% -50%", opacity: haltFade }}
    />
  );
}

function ValveWheel({ frame, y }: { frame: number; y: number }) {
  const lift = tw(frame, CLOSED_AT - 3, CLOSED_AT, 0, 2);
  const angle = tw(frame, CLOSED_AT, CLOSED_AT + 12, 0, 90) * tw(frame, OPEN_AT - 12, OPEN_AT, 1, 0);
  return (
    <div
      className="absolute"
      style={{ left: VALVE_X, top: y + lift, translate: "-50% -50%" }}
    >
      <svg width={44} height={44} viewBox="0 0 44 44" className="text-text-secondary" fill="none">
        <g transform={`rotate(${angle} 22 22)`}>
          <circle cx={22} cy={22} r={15} stroke="currentColor" strokeWidth={2.5} />
          <line x1={22} y1={7} x2={22} y2={37} stroke="currentColor" strokeWidth={2} />
          <line x1={7} y1={22} x2={37} y2={22} stroke="currentColor" strokeWidth={2} />
          <line x1={11.4} y1={11.4} x2={32.6} y2={32.6} stroke="currentColor" strokeWidth={1.4} />
          <line x1={32.6} y1={11.4} x2={11.4} y2={32.6} stroke="currentColor" strokeWidth={1.4} />
        </g>
      </svg>
    </div>
  );
}

export function F3PauseScene() {
  const frame = useCurrentFrame();
  const leverAngle = tw(frame, LEVER_AT, LEVER_AT + 6, -25, 25) * tw(frame, 186, 195, 1, 0);
  const paused = leverAngle > 0;
  const dim = tw(frame, 114, 120, 0, 1) * tw(frame, 174, 180, 1, 0);
  const channelLit = tw(frame, 78, 96, 0, 1);
  const handT = tw(frame, 132, 150, 0, 1);
  const handSlip = 6 * Math.sin(Math.PI * lin(frame, 150, 156, 0, 1));
  const handX = 1040 + (700 - 1040) * handT;
  const handY = 120 + (312 - 120) * handT + (handT >= 1 ? handSlip : 0);
  const noteCrumple = {
    scale: String(tw(frame, 165, 174, 1, 0.92)),
    opacity: tw(frame, 165, 174, 1, 0.28),
  };

  return (
    <ConceptScene
      seed="robustness-f3"
      kicker="PAUSE SCOPE SPLIT"
      title="an operational switch can never pick winners"
      caption="pause gates the two intake valves · adjudication has no valve to close"
    >
      <div className="relative" style={{ width: 1400, height: 640 }}>
        {/* intake pipes */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1400 640" fill="none">
          <line x1={70} y1={PIPE_Y.create} x2={VALVE_X} y2={PIPE_Y.create}
            className="text-border-subtle" stroke="currentColor" strokeWidth={2}
            pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 3, 12)} />
          <line x1={70} y1={PIPE_Y.stake} x2={VALVE_X} y2={PIPE_Y.stake}
            className="text-border-subtle" stroke="currentColor" strokeWidth={2}
            pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 8, 12)} />
          {(["create", "stake"] as const).map((k) => (
            <line
              key={k}
              x1={VALVE_X} y1={PIPE_Y[k]} x2={566} y2={PIPE_Y[k]}
              className="text-border-subtle"
              stroke="currentColor" strokeWidth={2} pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={draw(frame, k === "create" ? 12 : 16, 10)}
              opacity={paused ? 0.3 : 1}
            />
          ))}
          <line x1={576} y1={150} x2={576} y2={330}
            className="text-border-subtle" stroke="currentColor" strokeWidth={2}
            pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 18, 10)} />
          <polygon points="566,170 556,164 556,176" className="text-border-subtle" fill="currentColor" />
          <polygon points="566,310 556,304 556,316" className="text-border-subtle" fill="currentColor" />
          {/* station ticks */}
          {STATION_X.map((x, i) => (
            <line key={i} x1={x} y1={268} x2={x} y2={352}
              className="text-border-subtle" stroke="currentColor" strokeWidth={1.5}
              opacity={tw(frame, 14 + i * 3, 24 + i * 3, 0, 0.8)} />
          ))}
        </svg>

        {/* pipe labels */}
        <div className="absolute font-mono text-sm text-text-secondary" style={{ left: 74, top: 140, ...rise(frame, 6, 8) }}>
          create_dispute
        </div>
        <div className="absolute font-mono text-sm text-text-secondary" style={{ left: 74, top: 280, ...rise(frame, 9, 8) }}>
          stake
        </div>
        <div className="absolute font-mono text-xs text-muted-foreground" style={{ left: 556, top: 344, opacity: tw(frame, 22, 30, 0, 1) }}>
          subaccord intake
        </div>

        <ValveWheel frame={frame} y={PIPE_Y.create} />
        <ValveWheel frame={frame} y={PIPE_Y.stake} />

        {/* intake tokens */}
        <IntakeDot frame={frame} spawn={10} y={PIPE_Y.create} />
        <IntakeDot frame={frame} spawn={26} y={PIPE_Y.stake} />
        <IntakeDot frame={frame} spawn={204} y={PIPE_Y.create} />
        <IntakeDot frame={frame} spawn={212} y={PIPE_Y.stake} />

        {/* gated chips at the valves */}
        <div className="absolute" style={{ left: 452, top: 128, ...pop(frame, 92, 8) }}>
          <MonoChip tone="slash">gated</MonoChip>
        </div>
        <div className="absolute" style={{ left: 452, top: 268, ...pop(frame, 108, 8) }}>
          <MonoChip tone="slash">gated</MonoChip>
        </div>

        {/* PAUSE plate + lever */}
        <div
          className="absolute flex w-[170px] flex-col items-center gap-1 rounded-xl border border-border-subtle bg-raised/60 px-4 py-3"
          style={{ left: 140, top: 430, ...rise(frame, 15, 12) }}
        >
          <div className="font-mono text-sm tracking-[0.3em] text-text-secondary">PAUSE</div>
          <svg width={80} height={44} viewBox="0 0 80 44" fill="none">
            <circle cx={40} cy={36} r={4} className="text-text-secondary" fill="currentColor" />
            <line
              x1={40} y1={36} x2={40 + 26 * Math.sin((leverAngle * Math.PI) / 180)}
              y2={36 - 26 * Math.cos((leverAngle * Math.PI) / 180)}
              className={paused ? "text-amber" : "text-confirm"} stroke="currentColor" strokeWidth={3} strokeLinecap="square"
            />
          </svg>
          <div className={`font-mono text-xs ${paused ? "text-amber" : "text-confirm"}`}>
            {paused ? "intake gated" : "running"}
          </div>
        </div>

        {/* the ungated adjudication channel */}
        <div
          className="absolute rounded-2xl border border-border-subtle bg-raised/25"
          style={{
            left: CHANNEL.x0, top: CHANNEL.y0, width: CHANNEL.x1 - CHANNEL.x0, height: CHANNEL.y1 - CHANNEL.y0,
            opacity: tw(frame, 6, 18, 0, 1),
          }}
        />
        <div
          className="absolute rounded-2xl border border-amber/30"
          style={{
            left: CHANNEL.x0, top: CHANNEL.y0, width: CHANNEL.x1 - CHANNEL.x0, height: CHANNEL.y1 - CHANNEL.y0,
            opacity: channelLit,
            boxShadow: `0 0 ${24 * channelLit}px var(--accord-amber)`,
          }}
        />
        {/* station labels */}
        {STATIONS.map((s, i) => (
          <div
            key={s}
            className="absolute font-mono text-sm text-text-secondary"
            style={{ left: STATION_X[i], top: 366, translate: "-50% 0", ...rise(frame, 12 + i * 3, 8) }}
          >
            {s}
          </div>
        ))}

        {/* conveyor tokens — ambient, never stopping */}
        {Array.from({ length: 7 }, (_, i) => {
          const span = CHANNEL.x1 - CHANNEL.x0;
          const x = CHANNEL.x0 + ((frame * 2.4 + i * 108) % span);
          const edge = Math.min((x - CHANNEL.x0) / 46, (CHANNEL.x1 - x) / 46, 1);
          return (
            <div
              key={i}
              className="absolute h-2.5 w-2.5 rounded-full bg-amber"
              style={{
                left: x, top: FLOW_Y, translate: "-50% -50%",
                opacity: Math.max(0, Math.min(1, edge)) * 0.9,
                boxShadow: "0 0 8px var(--accord-amber)",
              }}
            />
          );
        })}

        {/* bracket — structurally un-gateable */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1400 640" fill="none">
          <path
            d="M 655 222 L 655 214 L 1285 214 L 1285 222"
            className="text-amber" stroke="currentColor" strokeWidth={1.5}
            pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 84, 15)}
          />
        </svg>
        <div
          className="absolute font-mono text-sm text-amber"
          style={{ left: 970, top: 184, translate: "-50% 0", ...rise(frame, 96, 9) }}
        >
          structurally un-gateable
        </div>

        {/* scene dim under the vignette */}
        <div className="absolute inset-0 rounded-2xl bg-ink/40" style={{ opacity: dim }} />

        {/* attack vignette (ghost styling) */}
        <div
          className="absolute flex w-[640px] flex-col items-center gap-2 rounded-xl border border-dashed border-slash/40 px-6 py-4"
          style={{
            left: 710, top: 18,
            opacity: tw(frame, 120, 129, 0, 0.9) * noteCrumple.opacity,
            scale: noteCrumple.scale,
          }}
        >
          <div className="font-mono text-base text-slash">
            pause during appeal window → smother appeals → forced finality
          </div>
          <svg width={120} height={34} viewBox="0 0 120 34" className="absolute" fill="none"
            style={{ left: "50%", top: "50%", translate: "-50% -50%" }}>
            <line x1={16} y1={8} x2={104} y2={26} className="text-slash" stroke="currentColor" strokeWidth={3}
              strokeLinecap="square" pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 156, 6)} />
            <line x1={104} y1={8} x2={16} y2={26} className="text-slash" stroke="currentColor" strokeWidth={3}
              strokeLinecap="square" pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, 161, 6)} />
          </svg>
        </div>
        {/* the ghost hand, reaching for a valve that is not there */}
        {frame >= 132 && frame <= 174 ? (
          <div
            className="absolute"
            style={{ left: handX, top: handY, translate: "-50% -50%", opacity: tw(frame, 132, 138, 0, 1) }}
          >
            <svg width={54} height={54} viewBox="0 0 54 54" className="text-slash/70" fill="none">
              <rect x={8} y={20} width={30} height={24} rx={7} stroke="currentColor" strokeWidth={2.5} strokeDasharray="4 4" />
              <rect x={28} y={4} width={11} height={22} rx={5} stroke="currentColor" strokeWidth={2.5} strokeDasharray="4 4" />
            </svg>
          </div>
        ) : null}
        {/* the missing mount */}
        <div
          className="absolute flex items-center gap-2"
          style={{ left: 700, top: 268, translate: "-50% -50%", opacity: tw(frame, 150, 158, 0, 1) * tw(frame, 174, 182, 1, 0) }}
        >
          <svg width={30} height={30} viewBox="0 0 30 30" fill="none">
            <circle cx={15} cy={15} r={11} className="text-slash/50" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 4" />
            <line x1={7} y1={7} x2={23} y2={23} className="text-slash/50" stroke="currentColor" strokeWidth={1.5} />
          </svg>
          <span className="font-mono text-xs text-slash/70">no valve here</span>
        </div>

        {/* summary chips */}
        <div className="absolute" style={{ left: 620, top: 448, ...pop(frame, 240, 9) }}>
          <MonoChip tone="slash">gated by pause · create_dispute · stake</MonoChip>
        </div>
        <div className="absolute" style={{ left: 620, top: 492, ...pop(frame, 252, 9) }}>
          <MonoChip tone="amber">never gateable · appeal · commit · reveal · finalize · unstake</MonoChip>
        </div>
        <div className="absolute" style={{ left: 140, top: 560, ...pop(frame, 264, 9) }}>
          <MonoChip tone="confirm">resume reopens intake · nothing was adjudicated</MonoChip>
        </div>
      </div>
    </ConceptScene>
  );
}
