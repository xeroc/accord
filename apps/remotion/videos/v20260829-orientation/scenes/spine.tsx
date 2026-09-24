import type { FC, ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { StepRail } from "../../../src/shell/rail";
import { AccordMark, MonoChip } from "@useaccord/ui";

/**
 * A3 · The Arbitrable spine — two CPI calls, party-blind. Four
 * heterogeneous consumers each fire the same window: a wide payload
 * chip (everything the consumer knows) travels the out-arrow; at the
 * CPI plane the excess glyphs dissolve and the chip narrows to
 * (options · hash · fee); the box answers with a bare u64 on the
 * return arrow; the consequence fires back home in the consumer.
 * The spine never moves again after its entrance — stoicism as
 * characterization, and it never takes the accent.
 */

const PLANE_X = 1060;
const BOX = { x: 1180, y: 240, w: 380, h: 580 };
const CONSUMER_W = 400;
const CONSUMER_H = 120;

const CONSUMERS = [
  { key: "registry", icon: "list", yc: 300, extras: ["parties", "titles", "history", "terms", "state"] },
  { key: "escrow", icon: "lock", yc: 450, extras: ["amount", "deadline", "parties", "rules", "state"] },
  { key: "gate", icon: "gate", yc: 600, extras: ["roles", "policy", "audit", "terms", "state"] },
  { key: "wallet", icon: "wallet", yc: 750, extras: ["routes", "balances", "notes", "flags", "state"] },
] as const;

const CORE = ["options", "hash", "fee"] as const;
const GLYPH_W = 44;
const GLYPH_GAP = 2;

/** Cycle timing: consumer n's window (stride 70f) and its beat offsets. */
const cyc = (n: number) => 66 + n * 70;
const O = {
  payload: 0, // chip pops out of the consumer
  travel: 6, // 6–32, ease-in-out; the plane is crossed at +21
  dissolve: 4, // extras drop away, done by +17 — before the plane at +18
  plane: 21, // checkpoint flash at the boundary
  enter: 26, // chip slips into the box
  glow: 27, // muffled sweep behind the glass, 11f
  ret: 34, // u64 returns, 14f
  land: 48, // ruling lands on the consumer
  cons: 51, // consequence fires at home, 11f
} as const;

/* Deterministic motion math — same dialect as the sibling scenes. */
const tw = (frame: number, from: number, dur: number, y0: number, y1: number) =>
  interpolate(frame, [from, from + dur], [y0, y1], { easing: EASE_EXPO, ...clamp });
const lin = (frame: number, from: number, dur: number, y0: number, y1: number) =>
  interpolate(frame, [from, from + dur], [y0, y1], clamp);
const bump = (frame: number, from: number, dur: number) =>
  frame <= from || frame >= from + dur ? 0 : Math.sin(Math.PI * ((frame - from) / dur));
/** Ease-in-out travel — request/response semantics (the Coin curve). */
const TRAVEL = Easing.bezier(0.45, 0, 0.25, 1);

const ICONS: Record<string, ReactNode> = {
  list: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  ),
  lock: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="8" cy="8" r="5" />
      <path d="M8 6v2.6M6.5 10.6h3" />
    </svg>
  ),
  gate: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M4 13V6.5L8 3l4 3.5V13" />
      <path d="M2 13h12M6.5 13v-3h3v3" />
    </svg>
  ),
  wallet: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <rect x="2.5" y="4.5" width="11" height="8" rx="2" />
      <path d="M2.5 8h11M11 6.5h.01" />
    </svg>
  ),
};

/**
 * GlyphPill — one payload glyph. Extras drop away before the plane
 * (fade + shrink + 16px fall) while their width collapses, physically
 * narrowing the chip; core glyphs stay and brighten.
 */
const GlyphPill: FC<{
  glyph: string;
  core: boolean;
  progress: number; // 0 = intact, 1 = fully gone (extras only)
}> = ({ glyph, core, progress }) => {
  const width = core ? GLYPH_W : GLYPH_W * (1 - progress);
  if (width < 1) {
    return null;
  }
  const cls = core
    ? "border-nearwhite/40 bg-nearwhite/10 text-nearwhite"
    : "border-border-subtle bg-raised text-muted-foreground";
  const fade = core ? 1 : Math.max(0, 1 - progress / 0.7);
  return (
    <div
      data-glyph={glyph}
      className={`overflow-hidden rounded-full border text-center font-mono ${cls}`}
      style={{
        width,
        height: 24,
        lineHeight: "24px",
        fontSize: 9,
        flex: "0 0 auto",
        opacity: fade,
        transform: `translateY(${progress * 16}px) scale(${1 - progress * 0.4})`,
      }}
    >
      {glyph}
    </div>
  );
};

/** PayloadChip — the wide chip that shrinks to (options · hash · fee). */
const PayloadChip: FC<{
  frame: number;
  n: number;
  yc: number;
  extras: readonly string[];
}> = ({ frame, n, yc, extras }) => {
  const t0 = cyc(n);
  const y = yc - 18;
  const op = interpolate(frame, [t0, t0 + 3, t0 + O.enter, t0 + O.enter + 4], [0, 1, 1, 0], clamp);
  if (op <= 0) {
    return null;
  }
  const t = interpolate(frame, [t0 + O.travel, t0 + O.travel + 26], [0, 1], { easing: TRAVEL, ...clamp });
  const left = 548 + t * 572;
  return (
    <div
      data-payload={n}
      className="absolute flex items-center"
      style={{ left, top: y, translate: "0 -50%", opacity: op, gap: GLYPH_GAP }}
    >
      {extras.map((glyph, i) => (
        <GlyphPill
          key={glyph}
          glyph={glyph}
          core={false}
          progress={lin(frame, t0 + O.dissolve + i * 2, 5, 0, 1)}
        />
      ))}
      {CORE.map((glyph) => (
        <GlyphPill key={glyph} glyph={glyph} core={true} progress={0} />
      ))}
    </div>
  );
};

/** CheckpointFlash — the family's boundary-crossing beat at the plane. */
const CheckpointFlash: FC<{ frame: number; at: number; y: number }> = ({ frame, at, y }) => {
  const p = lin(frame, at, 7, 0, 1);
  if (p <= 0 || p >= 1) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute" style={{ left: PLANE_X, top: y }}>
      <div
        className="absolute rounded-full border border-amber"
        style={{ width: 12, height: 12, translate: "-50% -50%", scale: String(1 + p * 2.6), opacity: (1 - p) * 0.9 }}
      />
      <div
        className="absolute rounded-full bg-amber"
        style={{ width: 6, height: 6, translate: "-50% -50%", opacity: bump(frame, at, 5) }}
      />
    </div>
  );
};

/** ReturnChip — the bare u64 answer traveling home. */
const ReturnChip: FC<{ frame: number; n: number; yc: number }> = ({ frame, n, yc }) => {
  const t0 = cyc(n);
  const y = yc + 18;
  const op = interpolate(frame, [t0 + O.ret, t0 + O.ret + 2, t0 + O.land, t0 + O.land + 3], [0, 1, 1, 0], clamp);
  if (op <= 0) {
    return null;
  }
  const t = interpolate(frame, [t0 + O.ret, t0 + O.land], [0, 1], { easing: TRAVEL, ...clamp });
  const x = 1178 + t * (560 - 1178);
  return (
    <div className="absolute" style={{ left: x, top: y, translate: "-50% -50%", opacity: op }}>
      <MonoChip tone="amber" className="px-3 py-1 text-xs">
        u64
      </MonoChip>
    </div>
  );
};

/* — per-consumer consequences (fire at home, in the consumer's chip) — */

const RegistryConsequence: FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const flipped = frame >= at + 3;
  return (
    <div className="flex flex-col gap-2 font-mono text-[10px]">
      {["claim ·0141", "claim ·0142"].map((row, i) => {
        const mine = i === 1;
        const lit = mine && flipped;
        return (
          <div
            key={row}
            className={`flex items-center justify-between gap-4 rounded border px-2 py-1 ${
              lit ? "border-amber/60 bg-amber/10" : "border-border-subtle bg-ink"
            }`}
            style={{ opacity: mine ? 1 : 0.55 }}
          >
            <span className="text-text-secondary">{row}</span>
            <span className={lit ? "text-confirm" : "text-muted-foreground"}>
              {lit ? "refunded" : "held"}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const EscrowConsequence: FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const t = lin(frame, at + 1, 9, 0, 1);
  return (
    <div className="relative h-full w-full">
      <div className="absolute rounded-full border border-nearwhite/50 bg-nearwhite/10" style={{ left: 18, top: 22, width: 26, height: 26 }} />
      <div className="absolute rounded-full border border-border-subtle" style={{ left: 158, top: 22, width: 26, height: 26 }} />
      <div
        className="absolute rounded-full bg-nearwhite"
        style={{ left: 27 + t * 140, top: 33, width: 12, height: 12, translate: "-50% 0", opacity: t > 0 ? 1 : 0 }}
      />
      {t >= 1 ? <div className="absolute rounded-full bg-nearwhite/40" style={{ left: 158, top: 22, width: 26, height: 26, opacity: 0.5 }} /> : null}
      <span className="absolute font-mono text-[9px] text-muted-foreground" style={{ left: 14, top: 54 }}>
        escrow
      </span>
      <span className="absolute font-mono text-[9px] text-muted-foreground" style={{ left: 152, top: 54 }}>
        winner
      </span>
    </div>
  );
};

const GateConsequence: FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const t = tw(frame, at + 1, 8, 0, 1);
  const closed = frame < at + 6;
  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative h-8 w-[104px] rounded-full border ${closed ? "border-border-subtle bg-raised" : "border-confirm/50 bg-confirm/10"}`}
      >
        <div
          className={`absolute top-1 h-6 w-6 rounded-full ${closed ? "bg-muted-foreground" : "bg-confirm"}`}
          style={{ left: 4 + t * 72 }}
        />
      </div>
      <span className={`font-mono text-[10px] ${closed ? "text-muted-foreground" : "text-confirm"}`}>
        {closed ? "deny" : "allow"}
      </span>
    </div>
  );
};

const WalletConsequence: FC<{ frame: number; at: number }> = ({ frame, at }) => {
  const lit = frame >= at + 1;
  return (
    <div className="relative h-full w-full">
      {[10, 30, 50].map((top, i) => (
        <div
          key={top}
          className={`absolute h-[3px] rounded-full ${i === 1 && lit ? "bg-amber" : "bg-border-subtle"}`}
          style={{ left: 8, top, width: i === 1 ? 140 : 110, opacity: i === 1 || !lit ? 1 : 0.55 }}
        />
      ))}
      <div
        className={`absolute h-3.5 w-3.5 rounded-full border ${lit ? "border-amber bg-amber/40" : "border-border-subtle"}`}
        style={{ left: 156, top: 24 }}
      />
      <span className="absolute font-mono text-[9px] text-muted-foreground" style={{ left: 150, top: 44 }}>
        out
      </span>
    </div>
  );
};

type Consumer = (typeof CONSUMERS)[number];
type ConsumerKey = Consumer["key"];

const CONSEQUENCES: Record<ConsumerKey, FC<{ frame: number; at: number }>> = {
  registry: RegistryConsequence,
  escrow: EscrowConsequence,
  gate: GateConsequence,
  wallet: WalletConsequence,
};

/** ConsumerChip — one heterogeneous Arbitrable. Accent lands here, never on the box. */
const ConsumerChip: FC<{ frame: number; consumer: Consumer; n: number }> = ({
  frame,
  consumer,
  n,
}) => {
  const t0 = cyc(n);
  const entered = tw(frame, 4 + n * 3, 9, 0, 1);
  const enterX = tw(frame, 4 + n * 3, 9, -24, 0);
  const hot = bump(frame, t0 + O.land, 10);
  const walletBob = consumer.key === "wallet" ? 2 * Math.sin((frame * 2 * Math.PI) / 90) : 0;
  const Cons = CONSEQUENCES[consumer.key];
  return (
    <div
      data-consumer={consumer.key}
      className={`absolute flex items-center gap-4 rounded-xl border bg-raised/60 px-4 ${
        hot > 0.4 ? "border-amber/60" : "border-border-subtle"
      }`}
      style={{
        left: 140,
        top: consumer.yc - CONSUMER_H / 2,
        width: CONSUMER_W,
        height: CONSUMER_H,
        opacity: entered,
        transform: `translate(${enterX}px, ${walletBob}px)`,
        boxShadow: hot > 0 ? `0 0 ${22 * hot}px var(--accord-amber)` : undefined,
      }}
    >
      <div className="flex h-full flex-col items-start justify-center gap-1.5 text-text-secondary">
        <span className="flex items-center gap-2 font-mono text-xs">
          {ICONS[consumer.icon]}
          {consumer.key === "gate" ? "authority gate" : consumer.key}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          arbitrable · {String.fromCharCode(65 + n)}
        </span>
      </div>
      <div className="h-[84px] w-[210px]">
        <Cons frame={frame} at={t0 + O.cons} />
      </div>
    </div>
  );
};

export function SpineScene() {
  const frame = useCurrentFrame();

  const spineIn = tw(frame, 10, 18, 0, 1);
  const spineScale = tw(frame, 10, 18, 0.98, 1);
  const planeDraw = tw(frame, 26, 12, 0, 1);
  const planeMarch = -((frame * 0.3) % 18);
  const glowBreath = 0.5 + 0.3 * Math.sin((frame * 2 * Math.PI) / 120);

  return (
    <Scene seed="orientation-spine">
      <div className="absolute inset-0">
        {/* header chrome */}
        <header className="absolute left-16 top-10 right-16 flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-sm tracking-[0.4em] text-amber">A3 · THE ARBITRABLE SPINE</span>
            <span className="font-mono text-xs text-muted-foreground">dashed plane = cpi boundary</span>
          </div>
        </header>
        <div className="absolute left-0 right-0 top-24">
          <StepRail
            steps={[
              { label: "interface", frames: 66 },
              { label: "registry", frames: 70 },
              { label: "escrow", frames: 70 },
              { label: "gate", frames: 70 },
              { label: "wallet", frames: 70 },
              { label: "enforce", frames: 104 },
            ]}
          />
        </div>

        {/* arrows + plane (one SVG, canvas coordinates) */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1920 1080" fill="none" aria-hidden>
          {/* CPI boundary plane — dashed, slow dash-march */}
          <line
            x1={PLANE_X}
            y1={200}
            x2={PLANE_X}
            y2={850}
            className="stroke-border-subtle"
            stroke="currentColor"
            strokeWidth={2}
            strokeDasharray="10 8"
            strokeDashoffset={planeMarch}
            pathLength={1}
            opacity={planeDraw}
          />

          {CONSUMERS.map((c, n) => {
            const yc = c.yc;
            const t0 = cyc(n);
            const draw = tw(frame, 32 + n * 3, 9, 0, 1);
            const active = interpolate(
              frame,
              [t0 + 4, t0 + 8, t0 + 50, t0 + 58],
              [0, 0.9, 0.9, 0],
              clamp,
            );
            return (
              <g key={c.key}>
                <g className="text-border-subtle" stroke="currentColor" strokeWidth={1.6}>
                  <path
                    d={`M 540 ${yc - 18} H 1176`}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - draw}
                  />
                  <path
                    d={`M 1180 ${yc + 18} H 544`}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - draw}
                  />
                </g>
                {active > 0 ? (
                  <g className="stroke-amber" stroke="currentColor" strokeWidth={1.6} opacity={active}>
                    <path d={`M 540 ${yc - 18} H 1176`} />
                    <path d={`M 1180 ${yc + 18} H 544`} />
                  </g>
                ) : null}
                <g className="fill-border-subtle" fill="currentColor">
                  <path d={`M 1176 ${yc - 22} l 10 4 l -10 4 z`} opacity={tw(frame, 40 + n * 3, 4, 0, 1)} />
                  <path d={`M 544 ${yc + 14} l -10 4 l 10 4 z`} opacity={tw(frame, 40 + n * 3, 4, 0, 1)} />
                </g>
              </g>
            );
          })}
        </svg>

        {/* the spine — one indifferent counterparty, never moves again */}
        <div
          className="absolute overflow-hidden rounded-2xl border border-border-subtle bg-ink"
          style={{
            left: BOX.x,
            top: BOX.y,
            width: BOX.w,
            height: BOX.h,
            opacity: spineIn,
            scale: String(spineScale),
          }}
        >
          {/* inner glow breathing behind the dark glass */}
          <div
            className="absolute inset-6 rounded-xl bg-amber/5 blur-2xl"
            style={{ opacity: frame >= 54 ? glowBreath : 0 }}
          />
          {/* muffled sweeps — one per processing window */}
          {CONSUMERS.map((c, n) => {
            const t0 = cyc(n);
            const p = lin(frame, t0 + O.glow, 11, 0, 1);
            if (p <= 0 || p >= 1) {
              return null;
            }
            return (
              <div
                key={c.key}
                className="absolute left-2 right-2 h-[140px] bg-gradient-to-b from-transparent via-amber/10 to-transparent blur-md"
                style={{ top: -40 + p * 480, opacity: Math.sin(Math.PI * p) }}
              />
            );
          })}
          <div className="absolute left-0 right-0 top-16 flex flex-col items-center gap-3">
            <AccordMark size={44} className="text-amber/80" />
            <span className="font-heading text-3xl font-bold text-nearwhite">accord</span>
            <span className="font-mono text-xs tracking-[0.4em] text-muted-foreground">party-blind</span>
          </div>
        </div>

        {/* plane label */}
        <span
          className="absolute font-mono text-xs tracking-[0.3em] text-muted-foreground"
          style={{ left: PLANE_X, top: 182, translate: "-50% 0", opacity: tw(frame, 30, 8, 0, 1) }}
        >
          cpi boundary
        </span>

        {/* call labels — once, on the middle pair of arrows */}
        <span
          className="absolute text-center font-mono text-[11px] text-text-secondary"
          style={{ left: 545, top: 406, width: 630, opacity: tw(frame, 52, 10, 0, 1) }}
        >
          create_dispute( subaccord, options, evidence_hash, fee )
        </span>
        <span
          className="absolute text-center font-mono text-[11px] text-text-secondary"
          style={{ left: 545, top: 478, width: 630, opacity: tw(frame, 54, 10, 0, 1) }}
        >
          get_ruling() → u64
        </span>

        {/* consumers */}
        {CONSUMERS.map((c, n) => (
          <ConsumerChip key={c.key} frame={frame} consumer={c} n={n} />
        ))}

        {/* subaccord route tags — on the arrows, not the payload */}
        {CONSUMERS.map((c, n) => {
          const t0 = cyc(n);
          const op = interpolate(frame, [t0 + 8, t0 + 12, t0 + 30, t0 + 36], [0, 0.9, 0.9, 0], clamp);
          if (op <= 0) {
            return null;
          }
          return (
            <span
              key={c.key}
              className="absolute font-mono text-[10px] text-amber"
              style={{ left: 700, top: c.yc - 40, opacity: op }}
            >
              ↳ via subaccord
            </span>
          );
        })}

        {/* the windows: payload chips, checkpoint flashes, return chips */}
        {CONSUMERS.map((c, n) => (
          <PayloadChip key={c.key} frame={frame} n={n} yc={c.yc} extras={c.extras} />
        ))}
        {CONSUMERS.map((c, n) => (
          <CheckpointFlash key={c.key} frame={frame} at={cyc(n) + O.plane} y={c.yc - 18} />
        ))}
        {CONSUMERS.map((c, n) => (
          <ReturnChip key={c.key} frame={frame} n={n} yc={c.yc} />
        ))}

        {/* closing captions */}
        <p
          className="absolute w-full text-center font-mono text-xl text-nearwhite"
          style={{ top: 942, opacity: tw(frame, 358, 12, 0, 1) }}
        >
          accord sees: ( options · hash · fee ) — nothing else
        </p>
        <p
          className="absolute w-full text-center font-mono text-lg text-text-secondary"
          style={{ top: 986, opacity: tw(frame, 382, 12, 0, 1) }}
        >
          two calls in, one u64 out — enforcement lives in the Arbitrable
        </p>
      </div>
    </Scene>
  );
}
