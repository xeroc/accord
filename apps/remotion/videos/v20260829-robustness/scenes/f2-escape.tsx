import { useCurrentFrame } from "remotion";

import { MonoChip, StateNode } from "@useaccord/ui";
import { ConceptScene, breath, draw, lin, pop, rise, stepped, tw } from "./chrome";

/**
 * F2 — the liveness escape hatch.
 *
 * Every stall class — silent VRF oracle, ghosting jurors, absent
 * cranker — is bounded by a countdown clock whose expiry opens a
 * permissionless exit onto the refund rail: Failed, then the filer's
 * refund. Three scenarios, three receipts, zero captures.
 */

const SPINE_Y = 390;
const RAIL_Y = 620;
const STATION_X = [250, 450, 650, 850, 1050] as const;
const FILER_X = 150;

interface Stall {
  x: number;
  label: string;
  glyph: "beacon" | "jurors" | "crank";
  /** countdown window (linear drain), exit arrow, active/verified windows */
  ring: [number, number];
  arrow: number;
  active: [number, number];
  receipt: number;
}

const STALLS: Stall[] = [
  { x: 250, label: "vrf oracle silent", glyph: "beacon", ring: [60, 84], arrow: 84, active: [54, 93], receipt: 135 },
  { x: 850, label: "jurors ghosting", glyph: "jurors", ring: [182, 206], arrow: 204, active: [170, 212], receipt: 250 },
  { x: 1050, label: "cranker absent", glyph: "crank", ring: [297, 321], arrow: 321, active: [291, 327], receipt: 365 },
];

/** the three token trajectories (enter → stall → exit → rail → filer) */
const TOKEN_A = [
  { at: 36, x: STATION_X[0], y: SPINE_Y },
  { at: 51, x: STATION_X[1], y: SPINE_Y },
  { at: 102, x: STATION_X[1], y: RAIL_Y },
  { at: 117, x: STATION_X[2], y: RAIL_Y },
  { at: 135, x: FILER_X, y: RAIL_Y },
];
const TOKEN_B = [
  { at: 140, x: STATION_X[0], y: SPINE_Y },
  { at: 152, x: STATION_X[1], y: SPINE_Y },
  { at: 161, x: STATION_X[2], y: SPINE_Y },
  { at: 170, x: STATION_X[3], y: SPINE_Y },
  { at: 219, x: STATION_X[3], y: RAIL_Y },
  { at: 232, x: STATION_X[2], y: RAIL_Y },
  { at: 250, x: FILER_X, y: RAIL_Y },
];
const TOKEN_C = [
  { at: 252, x: STATION_X[0], y: SPINE_Y },
  { at: 264, x: STATION_X[1], y: SPINE_Y },
  { at: 273, x: STATION_X[2], y: SPINE_Y },
  { at: 282, x: STATION_X[3], y: SPINE_Y },
  { at: 291, x: STATION_X[4], y: SPINE_Y },
  { at: 334, x: STATION_X[4], y: RAIL_Y },
  { at: 347, x: STATION_X[2], y: RAIL_Y },
  { at: 365, x: FILER_X, y: RAIL_Y },
];

function StallGlyph({ kind, frame, stall }: { kind: Stall["glyph"]; frame: number; stall: Stall }) {
  const dead = frame >= stall.active[0];
  if (kind === "beacon") {
    const pulse = dead ? 0 : 0.5 + 0.5 * breath(frame, 40);
    return (
      <svg width={44} height={32} viewBox="0 0 44 32" className={dead ? "text-muted-foreground" : "text-amber"} fill="none">
        <circle cx={22} cy={26} r={3} fill="currentColor" />
        <path d="M14 18 A11 11 0 0 1 30 18" stroke="currentColor" strokeWidth={2} opacity={dead ? 0.25 : 0.45 + pulse * 0.55} />
        <path d="M8 12 A20 20 0 0 1 36 12" stroke="currentColor" strokeWidth={2} opacity={dead ? 0.15 : 0.3 + pulse * 0.5} />
      </svg>
    );
  }
  if (kind === "jurors") {
    return (
      <div className="flex items-center gap-2">
        {[0, 1, 2].map((d) => {
          const faded = frame >= stall.active[0] + 4;
          return (
            <div key={d} className="relative">
              <div
                className={`h-3 w-3 rounded-full ${faded ? "bg-slash/25" : "bg-nearwhite/70"}`}
              />
              {faded ? (
                <div
                  className="absolute left-1/2 top-1/2 h-[18px] w-[1.5px] bg-slash"
                  style={{ translate: "-50% -50%", rotate: "45deg" }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <svg width={34} height={34} viewBox="0 0 34 34" className="text-muted-foreground" fill="none">
      <circle cx={17} cy={17} r={11} stroke="currentColor" strokeWidth={2} />
      <line x1={17} y1={17} x2={30} y2={6} stroke="currentColor" strokeWidth={2.5} strokeLinecap="square" />
      <circle cx={17} cy={17} r={2.5} fill="currentColor" />
    </svg>
  );
}

/** countdown ring — amber stroke draining at a constant rate */
function CountdownRing({ frame, window: win }: { frame: number; window: [number, number] }) {
  const frac = 1 - lin(frame, win[0], win[1], 0, 1);
  const C = 2 * Math.PI * 15;
  return (
    <svg width={38} height={38} viewBox="0 0 38 38" fill="none">
      <circle cx={19} cy={19} r={15} stroke="currentColor" strokeWidth={2} className="text-border-subtle" />
      <circle
        cx={19} cy={19} r={15} stroke="currentColor" strokeWidth={2} className="text-amber"
        strokeLinecap="square" pathLength={1} strokeDasharray={1}
        strokeDashoffset={1 - frac}
        transform="rotate(-90 19 19)"
      />
    </svg>
  );
}

function TravelDot({ frame, path, born, gone }: {
  frame: number;
  path: ReadonlyArray<{ at: number; x: number; y: number }>;
  born: number;
  gone: number;
}) {
  const p = stepped(frame, path);
  const op = tw(frame, born, born + 7, 0, 1) * tw(frame, gone, gone + 8, 1, 0);
  return (
    <div
      className="absolute h-3.5 w-3.5 rounded-full bg-amber"
      style={{
        left: p.x, top: p.y, translate: "-50% -50%", opacity: op,
        boxShadow: "0 0 12px var(--accord-amber)",
      }}
    />
  );
}

export function F2EscapeScene() {
  const frame = useCurrentFrame();
  const failedPulse = Math.max(
    Math.sin(Math.PI * lin(frame, 117, 127, 0, 1)),
    Math.sin(Math.PI * lin(frame, 232, 242, 0, 1)),
    Math.sin(Math.PI * lin(frame, 347, 357, 0, 1)),
    0,
  );
  const cardsBreathe = 1 + 0.02 * Math.sin(Math.PI * lin(frame, 368, 380, 0, 1));

  return (
    <ConceptScene
      seed="robustness-f2"
      kicker="LIVENESS ESCAPE HATCH"
      title="every stall has a priced exit"
      caption="the worst an attacker or a dead dependency can do is force a refund — not capture a ruling"
    >
      <div className="relative" style={{ width: 1280, height: 760 }}>
        {/* spine connectors */}
        <svg className="absolute inset-0 h-full w-full text-border-subtle" viewBox="0 0 1280 760" fill="none">
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={(STATION_X[i] ?? 250) + 14} y1={SPINE_Y} x2={(STATION_X[i + 1] ?? 1050) - 14} y2={SPINE_Y}
              stroke="currentColor" strokeWidth={1.5} pathLength={1}
              strokeDasharray={1} strokeDashoffset={draw(frame, 6 + i * 3, 9)}
            />
          ))}
          {/* refund rail — dashed teal, drawn right→left */}
          <line
            x1={STATION_X[4]} y1={RAIL_Y} x2={FILER_X} y2={RAIL_Y}
            stroke="currentColor" strokeWidth={1.5} strokeDasharray="7 7" pathLength={1}
            className="text-confirm/60" strokeDashoffset={draw(frame, 12, 15)}
          />
          {/* exit arrows: cul-de-sac → rail */}
          {STALLS.map((s, i) => (
            <line
              key={i}
              x1={s.x} y1={262} x2={s.x} y2={RAIL_Y - 8}
              stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 6" pathLength={1}
              className="text-confirm/70" strokeDashoffset={draw(frame, s.arrow, 9)}
            />
          ))}
        </svg>

        {/* the lifecycle spine */}
        {[
          { label: "Filed", at: 6, activeAt: 36, settleAt: 42 },
          { label: "Drawn", at: 9, activeAt: 39, settleAt: 93 },
          { label: "Committed", at: 12, activeAt: 152, settleAt: 161 },
          { label: "Revealed", at: 15, activeAt: 170, settleAt: 212 },
          { label: "Finalized", at: 18, activeAt: 291, settleAt: 334 },
        ].map((n, i) => (
          <div key={n.label} className="absolute" style={{ left: STATION_X[i], top: SPINE_Y, translate: "-50% -50%" }}>
            <StateNode
              frame={frame}
              label={n.label}
              at={n.at}
              activeAt={n.activeAt}
              settleAt={n.settleAt}
            />
          </div>
        ))}

        {/* culs-de-sac */}
        {STALLS.map((s, i) => {
          const active = frame >= s.active[0] && frame <= s.active[1];
          const verified = frame > s.active[1];
          return (
            <div
              key={s.label}
              className={`absolute flex w-[212px] flex-col items-center gap-1.5 rounded-xl border px-3 py-3 ${
                active
                  ? "border-amber/50 bg-amber/10"
                  : verified
                    ? "border-confirm/30 bg-raised/50"
                    : "border-border-subtle bg-raised/40"
              }`}
              style={{
                left: s.x, top: 128, translate: "-50% 0",
                opacity: tw(frame, 12 + i * 4, 24 + i * 4, 0, 1) * (active ? 1 : 0.62),
                scale: String(verified ? cardsBreathe : 1),
              }}
            >
              <StallGlyph kind={s.glyph} frame={frame} stall={s} />
              <div className="font-mono text-xs text-text-secondary">{s.label}</div>
              <CountdownRing frame={frame} window={s.ring} />
              <div className="font-mono text-[10px] text-muted-foreground">
                timeout · {["t_vrf", "t_reveal", "t_crank"][i]}
              </div>
            </div>
          );
        })}
        {/* stall chips */}
        <div className="absolute" style={{ left: 292, top: 288, ...pop(frame, 72, 8) }}>
          <MonoChip tone="slash">no draw</MonoChip>
        </div>
        <div className="absolute" style={{ left: 892, top: 288, ...pop(frame, 178, 8) }}>
          <MonoChip tone="slash">reveal shortfall</MonoChip>
        </div>
        <div className="absolute" style={{ left: 1052, top: 288, ...pop(frame, 293, 8) }}>
          <MonoChip tone="neutral">nobody cranks</MonoChip>
        </div>

        {/* Failed plate on the rail */}
        <div
          className="absolute flex items-center gap-3 rounded-xl border border-amber/50 bg-amber/10 px-5 py-3"
          style={{
            left: STATION_X[2], top: RAIL_Y, translate: "-50% -50%",
            opacity: tw(frame, 18, 28, 0, 1),
            boxShadow: `0 0 ${26 * failedPulse}px var(--accord-amber)`,
          }}
        >
          <span className="font-mono text-2xl text-amber">Failed</span>
          <span className="font-mono text-xs text-text-secondary">cancel_dispute</span>
        </div>

        {/* filer + refund receipts */}
        <div
          className="absolute flex items-center gap-2 rounded-lg border border-border-subtle bg-raised/60 px-3 py-2"
          style={{ left: 64, top: 540, ...rise(frame, 20, 9) }}
        >
          <span className="h-2 w-2 rounded-full bg-nearwhite" />
          <span className="font-mono text-sm text-text-secondary">filer</span>
        </div>
        {STALLS.map((s, i) => (
          <div key={i} className="absolute" style={{ left: 64, top: 596 + i * 34, ...pop(frame, s.receipt, 9) }}>
            <MonoChip tone="confirm">+ refund</MonoChip>
          </div>
        ))}

        {/* the three scenarios' tokens */}
        <TravelDot frame={frame} path={TOKEN_A} born={36} gone={135} />
        <TravelDot frame={frame} path={TOKEN_B} born={140} gone={250} />
        <TravelDot frame={frame} path={TOKEN_C} born={252} gone={365} />
      </div>
    </ConceptScene>
  );
}
