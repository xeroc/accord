import type { CSSProperties, FC } from "react";
import { Easing, interpolate, random, useVideoConfig } from "remotion";

import { clamp, enterAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { PhaseCaptions } from "../../../src/shell/rail";
import { TOKEN_TONE, type TokenTone } from "@useaccord/ui";

import { CONCEPTS } from "./timeline";

/**
 * pieces.tsx — the group-D staging vocabulary the kit deliberately
 * leaves scene-local: token particles, instruction wiring, the shared
 * invariant seal, audit ring, the D5 padlock and airlock doors, and
 * the D3 bond stacks. Same laws as the kit: tokens only, pure
 * functions of `frame`, settle entrances (0 % overshoot), randomness
 * only via remotion's random(seed).
 */

/** Canvas point for absolute-positioned staging (1920x1080 coords). */
export interface Pt {
  x: number;
  y: number;
}

/** Heavy stake material: fast-in, hard stop — coins land, never fly. */
const RIGID = Easing.bezier(0.3, 0, 1, 1);
/** The softest curve in the group, spent on the shackle opening. */
const GENTLE = Easing.bezier(0.4, 0, 0.2, 1);

/* ------------------------------------------------------------------ */
/* Scene chrome                                                        */
/* ------------------------------------------------------------------ */

/**
 * ConceptChrome — the shared concept-scene frame: caption row up top
 * (which of the five concepts is playing), the headline, and the
 * one-line sub copy at the bottom. Everything settles in from above.
 */
export const ConceptChrome: FC<{
  frame: number;
  fps: number;
  active: number;
  headline: string;
  sub: string;
}> = ({ frame, fps, active, headline, sub }) => {
  const capIn = enterAt(frame, fps, 0, 0.4);
  const headIn = enterAt(frame, fps, 0.15, 0.5);
  const subIn = enterAt(frame, fps, 0.45, 0.5);
  return (
    <>
      <div
        className="absolute inset-x-0 flex justify-center"
        style={{ top: 34, opacity: capIn }}
      >
        <PhaseCaptions labels={[...CONCEPTS]} active={active} />
      </div>
      <h2
        className="absolute inset-x-0 text-center font-heading text-5xl font-bold text-nearwhite"
        style={{
          top: 80,
          opacity: headIn,
          transform: `translateY(${(1 - headIn) * -10}px)`,
        }}
      >
        {headline}
      </h2>
      <p
        className="absolute inset-x-0 text-center font-mono text-xl text-text-secondary"
        style={{ bottom: 44, opacity: subIn }}
      >
        {sub}
      </p>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Money as material                                                   */
/* ------------------------------------------------------------------ */

/**
 * TokenParticle — one stake coin or fee grain traveling between two
 * canvas points. Stake: heavy, nearwhite, rigid ease, shallow arc.
 * Fee: light amber grain, settling ease, higher arc (the arc apex is
 * the 1/3-rule midpoint keyframe). Never crosses a vault for a slash
 * — that convention lives in the scenes.
 */
export const TokenParticle: FC<{
  frame: number;
  from: Pt;
  to: Pt;
  at: number;
  dur?: number;
  tone: TokenTone;
  /** arc height in px (defaults by material) */
  peak?: number;
}> = ({ frame, from, to, at, dur = 12, tone, peak }) => {
  if (frame < at || frame > at + dur + 2) {
    return null;
  }
  const stake = tone === "stake";
  const arc = peak ?? (stake ? 26 : 46);
  const t = interpolate(frame, [at, at + dur], [0, 1], {
    easing: stake ? RIGID : EASE_EXPO,
    ...clamp,
  });
  const x = from.x + (to.x - from.x) * t;
  const yMid = Math.min(from.y, to.y) - arc;
  const y = interpolate(t, [0, 0.5, 1], [from.y, yMid, to.y], clamp);
  const op = interpolate(
    frame,
    [at, at + 2, at + dur, at + dur + 2],
    [0, 1, 1, 0],
    clamp,
  );
  const size = stake ? 15 : 9;
  return (
    <div
      className={
        stake
          ? "absolute rounded-full border border-nearwhite/60 bg-nearwhite"
          : "absolute rounded-full bg-amber"
      }
      style={{
        left: x,
        top: y,
        translate: "-50% -50%",
        width: size,
        height: size,
        opacity: op,
        boxShadow: stake ? undefined : "0 0 10px var(--accord-amber)",
      }}
    />
  );
};

/**
 * InstructionChip — one instruction of the Subaccord, colored by the
 * mint whose vault it touches (D1's wiring diagram).
 */
export const InstructionChip: FC<{
  frame: number;
  fps: number;
  label: string;
  tone: TokenTone;
  at: number;
  style?: CSSProperties;
}> = ({ frame, fps, label, tone, at, style }) => {
  const t = TOKEN_TONE[tone];
  const pop = enterAt(frame, fps, at / fps, 10 / fps);
  return (
    <div
      className={`absolute flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs whitespace-nowrap ${t.border} ${t.bg} ${t.text}`}
      style={{
        ...style,
        opacity: pop,
        transform: `translate(-50%, -50%) translateY(${(1 - pop) * -8}px)`,
      }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {label}
    </div>
  );
};

/**
 * FlowArrow — an elbow connector drawn chip-edge → vault-edge in the
 * token's color (stroke draw, then the arrowhead lands). Each arrow
 * terminates strictly on its own vault — no arrow bridges the mints.
 */
export const FlowArrow: FC<{
  frame: number;
  from: Pt;
  to: Pt;
  tone: TokenTone;
  at: number;
  dur?: number;
}> = ({ frame, from, to, tone, at, dur = 12 }) => {
  const midX = (from.x + to.x) / 2;
  const d = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  const draw = interpolate(frame, [at, at + dur], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const head = interpolate(frame, [at + dur - 2, at + dur], [0, 1], clamp);
  const dir = Math.sign(to.x - from.x) || 1;
  const cls = tone === "stake" ? "text-nearwhite/50" : "text-amber/70";
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${cls}`}
      viewBox="0 0 1920 1080"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - draw}
      />
      <polygon
        points={`${to.x},${to.y} ${to.x - dir * 9},${to.y - 4.5} ${to.x - dir * 9},${to.y + 4.5}`}
        fill="currentColor"
        opacity={head}
      />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* The invariant seal (D1's equations, D2's conservation strip)        */
/* ------------------------------------------------------------------ */

/**
 * EquationBox — a boxed accounting invariant. Both sides count up from
 * zero and land equal; the `==` pulses once and the "✓ by construction"
 * tag settles in. One animation shared by D1 and D2 so the family
 * reads as one system.
 */
export const EquationBox: FC<{
  frame: number;
  fps: number;
  /** frame the box settles in from above */
  at: number;
  /** frame the Σ sides start counting */
  countAt: number;
  /** frame the `==` pulses and the ✓ tag lands */
  sealAt: number;
  tone: TokenTone;
  lhs: { label: string; value: number };
  rhs: { label: string; value: number };
  /** additional "+ Σ …" terms on the right-hand side */
  extra?: readonly { label: string; value: number }[];
  style?: CSSProperties;
}> = ({ frame, fps, at, countAt, sealAt, tone, lhs, rhs, extra, style }) => {
  const t = TOKEN_TONE[tone];
  const pop = enterAt(frame, fps, at / fps, 12 / fps);
  const pulse = interpolate(frame, [sealAt, sealAt + 4, sealAt + 8], [1, 1.06, 1], clamp);
  const tag = enterAt(frame, fps, (sealAt + 2) / fps, 8 / fps);
  const cnt = (v: number) =>
    Math.round(
      interpolate(frame, [countAt, countAt + 12], [0, v], {
        easing: EASE_EXPO,
        ...clamp,
      }),
    );
  return (
    <div
      className={`relative rounded-xl border bg-raised/70 px-6 py-3 ${t.border}`}
      style={{ ...style, opacity: pop, transform: `translateY(${(1 - pop) * -10}px)` }}
    >
      <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 font-mono text-base">
        <span className="text-text-secondary">{lhs.label}</span>
        <span className={`tabular-nums text-lg ${t.text}`}>
          {cnt(lhs.value).toLocaleString("en-US")}
        </span>
        <span
          className="inline-block text-nearwhite"
          style={{ transform: `scale(${pulse})` }}
        >
          ==
        </span>
        <span className="text-text-secondary">{rhs.label}</span>
        <span className={`tabular-nums text-lg ${t.text}`}>
          {cnt(rhs.value).toLocaleString("en-US")}
        </span>
        {extra?.map((e) => (
          <span key={e.label} className="flex items-baseline gap-3">
            <span className="text-muted-foreground">+</span>
            <span className="text-text-secondary">{e.label}</span>
            <span className={`tabular-nums text-lg ${t.text}`}>
              {cnt(e.value).toLocaleString("en-US")}
            </span>
          </span>
        ))}
      </div>
      <div
        className="absolute -top-3 right-4 rounded-full border border-confirm/50 bg-confirm/10 px-2 py-0.5 font-mono text-[10px] tracking-wider text-confirm"
        style={{ opacity: tag, transform: `scale(${0.8 + tag * 0.2})` }}
      >
        ✓ by construction
      </div>
    </div>
  );
};

/**
 * AuditRing — the soft highlight ring that hops vault → equation in
 * D1's audit glance. Pops at `at` and decays over ~16 frames.
 */
export const AuditRing: FC<{
  frame: number;
  x: number;
  y: number;
  w: number;
  h: number;
  at: number;
}> = ({ frame, x, y, w, h, at }) => {
  if (frame < at || frame > at + 16) {
    return null;
  }
  const t = interpolate(frame, [at, at + 3, at + 16], [0, 1, 1], clamp);
  const fade = interpolate(frame, [at + 8, at + 16], [1, 0], clamp);
  return (
    <div
      className="pointer-events-none absolute rounded-2xl border-2 border-amber"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        translate: "-50% -50%",
        opacity: 0.9 * fade,
        transform: `scale(${0.96 + t * 0.04})`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* D5 — the padlock and the airlock doors                              */
/* ------------------------------------------------------------------ */

/**
 * Padlock — the active_draws lock. Drops with a rigid settle (metal:
 * hard stop, 2 px follow-through shake); the shackle lifts on the
 * group's softest curve when every drawn dispute is terminal. `ghost`
 * re-materializes it with a deterministic flicker for the next juror.
 */
export const Padlock: FC<{
  frame: number;
  at: number;
  openAt?: number;
  ghost?: boolean;
  ghostAt?: number;
  fadeAt?: number;
  size?: number;
  style?: CSSProperties;
}> = ({ frame, at, openAt, ghost, ghostAt, fadeAt, size = 34, style }) => {
  const drop = interpolate(frame, [at, at + 19], [-46, 0], {
    easing: RIGID,
    ...clamp,
  });
  const shake = interpolate(frame, [at + 19, at + 21, at + 23], [0, 2, 0], clamp);
  const open = openAt
    ? interpolate(frame, [openAt, openAt + 19], [0, 1], { easing: GENTLE, ...clamp })
    : 0;
  const fade = fadeAt ? interpolate(frame, [fadeAt, fadeAt + 12], [1, 0], clamp) : 1;
  let op = drop > -46 ? 1 : 0;
  op *= fade;
  if (ghost && ghostAt !== undefined) {
    const sinceGhost = frame - ghostAt;
    if (sinceGhost < 0) {
      op = 0;
    } else {
      // flicker that settles into solidity over ~18 frames
      const w = interpolate(frame, [ghostAt, ghostAt + 18], [1, 0], clamp);
      const flick = random(`padlock-ghost:${Math.floor(frame / 2)}`) > 0.4 ? 1 : 0.15;
      op = 1 - w * (1 - flick);
    }
  }
  const ring =
    openAt && frame >= openAt && frame <= openAt + 14
      ? interpolate(frame, [openAt, openAt + 14], [0, 1], clamp)
      : -1;
  return (
    <div className="absolute" style={{ ...style, opacity: op }}>
      {ring >= 0 ? (
        <div
          className="absolute left-1/2 top-1/2 rounded-full border border-nearwhite/60"
          style={{
            width: 14 + ring * 26,
            height: 14 + ring * 26,
            translate: "-50% -50%",
            opacity: 1 - ring,
          }}
        />
      ) : null}
      <svg
        width={size}
        height={size * 1.25}
        viewBox="0 0 32 40"
        className="text-nearwhite"
        style={{
          transform: `translateY(${drop + shake}px)`,
          overflow: "visible",
        }}
      >
        <g
          style={{
            transform: `translateY(${open * -6}px) rotate(${open * -28}deg)`,
            transformOrigin: "22px 18px",
          }}
        >
          <path
            d="M 10 19 V 10 A 6 6 0 0 1 22 10 V 19"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="square"
          />
        </g>
        <rect x={5} y={19} width={22} height={17} rx={3} fill="currentColor" opacity={0.92} />
        <circle cx={16} cy={26.5} r={2.4} fill="var(--color-ink)" />
      </svg>
    </div>
  );
};

/**
 * AirlockDoor — one door of the withdraw airlock. Two panels slide
 * apart on `openAt` (7 f) and seal back on `closeAt`; the inner and
 * outer doors are never open in the same beat — the scenes sequence
 * them. Open state derives from frame thresholds, never a toggle.
 */
export const AirlockDoor: FC<{
  frame: number;
  at: number;
  openAt?: number;
  closeAt?: number;
  height?: number;
  label?: string;
  style?: CSSProperties;
}> = ({ frame, at, openAt, closeAt, height = 130, label, style }) => {
  const fps = useVideoConfig().fps;
  const pop = enterAt(frame, fps, at / fps, 10 / fps);
  const open =
    (openAt ? interpolate(frame, [openAt, openAt + 7], [0, 1], clamp) : 0) *
    (closeAt ? interpolate(frame, [closeAt, closeAt + 7], [1, 0], clamp) : 1);
  const slide = open * 15;
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{ ...style, opacity: pop }}
    >
      <div
        className="relative flex justify-center border-border-subtle"
        style={{ height }}
      >
        <div className="absolute inset-y-0 left-0 w-[3px] rounded bg-border-subtle" />
        <div className="absolute inset-y-0 right-0 w-[3px] rounded bg-border-subtle" />
        <div className="absolute inset-x-0 top-0 h-[3px] rounded bg-border-subtle" />
        <div
          className="absolute inset-y-[3px] left-1/2 w-[10px] rounded-sm border border-border-subtle bg-raised"
          style={{ transform: `translateX(calc(-100% - ${slide}px))` }}
        />
        <div
          className="absolute inset-y-[3px] left-1/2 w-[10px] rounded-sm border border-border-subtle bg-raised"
          style={{ transform: `translateX(${slide}px)` }}
        />
      </div>
      {label ? (
        <span className="mt-1 font-mono text-[10px] tracking-widest text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* D3 — bond stacks                                                    */
/* ------------------------------------------------------------------ */

/**
 * CoinStack — the appeal bond beside each rung: fee-token coins that
 * pile up (2 → 4 → 8 → 16) as the ladder climbs, with a 1.5 px impact
 * shake as the pile lands. Countable, visceral — the exponent made
 * out of money.
 */
export const CoinStack: FC<{
  frame: number;
  fps: number;
  at: number;
  count: number;
  style?: CSSProperties;
}> = ({ frame, fps, at, count, style }) => {
  const shake = interpolate(frame, [at + 7, at + 9, at + 11], [0, 1.5, 0], clamp);
  return (
    <div className="absolute" style={style}>
      <div className="flex h-[210px] flex-col-reverse items-center gap-[3px]">
        {Array.from({ length: count }, (_, i) => {
          const coinAt = at + Math.floor((i * 6) / count);
          const pop = enterAt(frame, fps, coinAt / fps, 3 / fps);
          return (
            <div
              key={i}
              className="h-[9px] w-[22px] rounded-full border border-amber/60 bg-amber"
              style={{
                opacity: pop,
                transform: `translateX(${shake}px) scaleY(${0.4 + pop * 0.6})`,
                boxShadow: "0 0 6px var(--accord-amber)",
              }}
            />
          );
        })}
      </div>
      <div
        className="mt-1 text-center font-mono text-[10px] tabular-nums text-amber"
        style={{ opacity: enterAt(frame, fps, (at + 6) / fps, 4 / fps) }}
      >
        ×{count}
      </div>
    </div>
  );
};
