import type { FC, ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { PhaseCaptions } from "../../../src/shell/rail";
import { Coin } from "../../../src/pieces/coin";
import {
  ChainStrip,
  JurorPool,
  MonoChip,
  StateNode,
  SUBACCORD_INTERNALS,
  SubaccordCard,
  TOKEN_TONE,
} from "@useaccord/ui";

/**
 * A1 · The system map — the cast of characters. The entity graph every
 * later illustration embeds: the chain boundary, the Accord program
 * with one expanded Subaccord (HERO) over a collapsed permissionless
 * stack, the dispute tree hanging below, and the four off-chain peers
 * reaching in through dashed wires. Build plays once, then the four
 * flow beats (stake · file · draw · crank) each fire once.
 */

/** Beat table (scene-local frames). */
const B = {
  boundaryAt: 0, // perimeter draws 21f; label at 15
  accordAt: 21, // program container settles
  heroAt: 30, // Subaccord A settles; internals cascade from 40
  stackAt: [60, 64], // collapsed B, C
  stackNoteAt: 70,
  // peers cascade at 72 + i·3 (cred, evid, vrf, crank); wires follow +4
  jurorsAt: 84,
  arbitrableAt: 88,
  disputesAt: [90, 94, 98], // dispute → round → appeal bond
  ledgerAt: 98,
  note1At: 108,
  // — life beats, one flow at a time —
  stakeAt: 120, // juror stakes in; lands 139
  stakeFlashAt: 139,
  disputeAt: 158, // arbitrable files; coin lands 179
  disputeHitAt: 179,
  ringAt: 183, // round ring draws
  vrfAt: 204, // wire pulses; glyph 206–226
  vrfHitAt: 226,
  jurorPopAt: 227,
  crankAt: 248, // wire pulses; ring turns 252
  crankTurnAt: 252,
  note2At: 276,
} as const;

const PEERS = [
  { x: 340, label: "credential authority", kind: "key" },
  { x: 700, label: "evidence daemon", kind: "list" },
  { x: 1060, label: "vrf oracle", kind: "bolt" },
  { x: 1420, label: "cranker", kind: "rotate" },
] as const;

/** Node centers of the dispute tree (y = pill center). */
const TREE = { y: 715, xs: [1150, 1330, 1490] } as const;

/* — deterministic motion math (frame-pure) — */

/** Brand-eased clamped tween — the court-scene precedent for spatial moves. */
const tw = (frame: number, from: number, dur: number, y0: number, y1: number) =>
  interpolate(frame, [from, from + dur], [y0, y1], { easing: EASE_EXPO, ...clamp });

/** Linear clamped tween — sweeps, draws, drifts. */
const lin = (frame: number, from: number, dur: number, y0: number, y1: number) =>
  interpolate(frame, [from, from + dur], [y0, y1], clamp);

/** One sine bump 0→1→0 across [from, from+dur]; 0 outside. */
const bump = (frame: number, from: number, dur: number) =>
  frame <= from || frame >= from + dur ? 0 : Math.sin(Math.PI * ((frame - from) / dur));

/** Ease-in-out travel curve — the Coin piece's request/response curve. */
const TRAVEL = Easing.bezier(0.45, 0, 0.25, 1);

/* — scene-local staging pieces (frame-pure, tokens only) — */

const PEER_GLYPH: Record<string, ReactNode> = {
  key: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <circle cx="5" cy="8" r="2.6" />
      <path d="M7.6 8H14M11.5 8v2.6M13.5 8v1.8" />
    </svg>
  ),
  list: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M3 4h10M3 8h10M3 12h6" />
    </svg>
  ),
  bolt: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden>
      <path d="M9 1.5 3.8 8.6H7.4L6.2 14.5 12.2 7H8.3z" />
    </svg>
  ),
  rotate: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M13 8.5A5 5 0 1 1 11 4.2" />
      <path d="M13 3.4v3h-3" />
    </svg>
  ),
};

/** Off-chain peer chip settling at its post above the boundary. */
const OffChainPeer: FC<{ frame: number; x: number; label: string; kind: string; at: number }> = ({
  frame,
  x,
  label,
  kind,
  at,
}) => (
  <div
    className="absolute flex items-center gap-2.5 rounded-full border border-border-subtle bg-raised px-4 py-2 font-mono text-sm text-text-secondary"
    style={{
      left: x,
      top: 150,
      translate: "-50% 0",
      opacity: tw(frame, at, 10, 0, 1),
      transform: `translateY(${tw(frame, at, 10, -10, 0)}px)`,
    }}
  >
    {PEER_GLYPH[kind]}
    {label}
  </div>
);

/**
 * DashedWire — an off-chain connector: dash-draws through an animated
 * SVG mask (the reveal edge), then idles; while `activeAt` fires the
 * dashes march and an amber tint pulses along it.
 */
const DashedWire: FC<{
  frame: number;
  id: string;
  d: string;
  at: number;
  dur?: number;
  activeAt?: number;
}> = ({ frame, id, d, at, dur = 14, activeAt }) => {
  const draw = tw(frame, at, dur, 0, 1);
  const active = activeAt !== undefined && frame >= activeAt && frame < activeAt + 26;
  const march = active ? -((frame - activeAt) * 2.4) : 0;
  const pulse = activeAt !== undefined ? bump(frame, activeAt, 18) : 0;
  return (
    <g className="text-border-subtle">
      <mask id={id}>
        <path
          d={d}
          fill="none"
          stroke="white"
          strokeWidth={3}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
      </mask>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeDasharray="6 6"
        strokeDashoffset={march}
        mask={`url(#${id})`}
      />
      {pulse > 0 ? (
        <path
          d={d}
          fill="none"
          className="stroke-amber"
          strokeWidth={1.6}
          strokeDasharray="6 6"
          strokeDashoffset={march}
          opacity={pulse * 0.85}
          mask={`url(#${id})`}
        />
      ) : null}
    </g>
  );
};
/**
 * Packet — a mint-tone particle traveling an edge with a gentle
 * request/response curve (stake = nearwhite per the two-mint law).
 */
const Packet: FC<{
  frame: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  at: number;
  dur: number;
  tone: "stake" | "fee";
  size?: number;
}> = ({ frame, from, to, at, dur, tone, size = 13 }) => {
  if (frame < at || frame > at + dur + 3) {
    return null;
  }
  const t = interpolate(frame, [at, at + dur], [0, 1], { easing: TRAVEL, ...clamp });
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t;
  const op = interpolate(frame, [at, at + 2, at + dur, at + dur + 3], [0, 1, 1, 0], clamp);
  const glow = tone === "stake" ? "var(--accord-nearwhite)" : "var(--accord-amber)";
  return (
    <div
      className={`absolute rounded-full ${TOKEN_TONE[tone].dot}`}
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        translate: "-50% -50%",
        opacity: op,
        boxShadow: `0 0 11px ${glow}`,
      }}
    />
  );
};

/** CheckpointFlash — the boundary crossing beat: ring + dot, ~120ms. */
const CheckpointFlash: FC<{ frame: number; at: number; x: number; y: number }> = ({ frame, at, x, y }) => {
  const p = lin(frame, at, 7, 0, 1);
  if (p <= 0 || p >= 1) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y }}>
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

/**
 * RowFlash — a brief accent wash over one card internal row, positioned
 * in card-local coordinates (rows pitch 32px from the first row's top).
 */
const RowFlash: FC<{ frame: number; at: number; row: number; tone: "stake" | "fee" }> = ({
  frame,
  at,
  row,
  tone,
}) => {
  const p = bump(frame, at, 10);
  if (p <= 0) {
    return null;
  }
  const cls =
    tone === "stake" ? "border-nearwhite/60 bg-nearwhite/10" : "border-amber/60 bg-amber/10";
  return (
    <div
      className={`pointer-events-none absolute rounded-md border-2 ${cls}`}
      style={{ left: 14, top: 34 + row * 32, width: 312, height: 26, opacity: p }}
    />
  );
};

/** Sparkle — the accumulator's one leaf-tick (4-ray star, pops once). */
const Sparkle: FC<{ frame: number; at: number; x: number; y: number }> = ({ frame, at, x, y }) => {
  const p = lin(frame, at, 9, 0, 1);
  if (p <= 0 || p >= 1) {
    return null;
  }
  const s = 6 + p * 10;
  return (
    <svg
      className="pointer-events-none absolute text-nearwhite"
      style={{ left: x - s, top: y - s, width: s * 2, height: s * 2, opacity: 1 - p }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19" />
    </svg>
  );
};

/** Caption — bottom-center takeaway line with enter/exit. */
const Caption: FC<{ frame: number; at: number; outAt?: number; children: ReactNode; dim?: boolean }> = ({
  frame,
  at,
  outAt,
  children,
  dim,
}) => (
  <p
    className={`absolute w-full text-center font-mono text-xl ${
      dim ? "text-text-secondary" : "text-nearwhite"
    }`}
    style={{
      top: 964,
      opacity: tw(frame, at, 12, 0, 1) * (outAt !== undefined ? tw(frame, outAt, 8, 1, 0) : 1),
    }}
  >
    {children}
  </p>
);

/* — the scene — */

export function MapScene() {
  const frame = useCurrentFrame();

  const boundaryDraw = tw(frame, B.boundaryAt, 21, 0, 1);
  const boundaryBreath = 0.85 + 0.15 * Math.sin((frame * 2 * Math.PI) / 120);
  const stackFloat = 3 * Math.sin((frame * 2 * Math.PI) / 165 + 1.9);
  const jurorBob = 2.5 * Math.sin((frame * 2 * Math.PI) / 90 + 0.7);
  const ringTurn = 30 * tw(frame, B.crankTurnAt, 10, 0, 1);
  const ringDraw = tw(frame, B.ringAt, 12, 0, 1);

  const capActive = frame < 120 ? 0 : frame < 158 ? 1 : frame < 204 ? 2 : frame < 248 ? 3 : 4;

  return (
    <Scene seed="orientation-map">
      <div className="absolute inset-0">
        {/* header chrome */}
        <header className="absolute left-16 top-10 right-16 flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-sm tracking-[0.4em] text-amber">A1 · THE SYSTEM MAP</span>
            <span className="font-mono text-xs text-muted-foreground">
              solid = on-chain · dashed = off-chain
            </span>
          </div>
          <PhaseCaptions labels={["map", "stake", "file", "draw", "crank"]} active={capActive} className="mt-1" />
        </header>

        {/* wires + boundary (one SVG, canvas coordinates) */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1920 1080" fill="none" aria-hidden>
          {/* chain boundary — solid perimeter, draws once, breathes */}
          <rect
            x={260}
            y={250}
            width={1320}
            height={630}
            rx={28}
            className="stroke-border-subtle"
            stroke="currentColor"
            strokeWidth={2}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - boundaryDraw}
            opacity={boundaryBreath}
          />

          {/* dashed off-chain wires (mask draw-on) */}
          <DashedWire frame={frame} id="ori-map-cred" d="M 340 200 L 218 238 Q 178 420 150 598" at={76} />
          <DashedWire frame={frame} id="ori-map-evid" d="M 700 200 L 540 369" at={79} />
          <DashedWire frame={frame} id="ori-map-vrf" d="M 1060 200 L 600 369" at={82} activeAt={B.vrfAt} />
          <DashedWire frame={frame} id="ori-map-crank" d="M 1420 200 L 1332 684" at={85} activeAt={B.crankAt} />
          {/* juror stake wire — off-chain wallet reaching in */}
          <DashedWire frame={frame} id="ori-map-stake" d="M 172 652 Q 244 556 330 428" at={88} />

          {/* touchpoint dots on the hero card's top edge */}
          {[
            { x: 540, at: 83 },
            { x: 600, at: 86 },
          ].map((dot) => (
            <circle
              key={dot.x}
              cx={dot.x}
              cy={373}
              r={3.5}
              className="fill-border-subtle"
              fill="currentColor"
              opacity={tw(frame, dot.at, 6, 0, 1)}
            />
          ))}

          {/* solid on-chain edges */}
          <g className="text-border-subtle" stroke="currentColor" strokeWidth={1.6}>
            <path
              d="M 1160 650 L 1192 696"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - tw(frame, 94, 8, 0, 1)}
            />
            <path
              d="M 1196 715 L 1292 715"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - tw(frame, 98, 7, 0, 1)}
            />
            <path
              d="M 1366 715 L 1432 715"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - tw(frame, 101, 7, 0, 1)}
            />
            {/* arbitrable → dispute (the CPI) */}
            <path
              d="M 1636 730 L 1210 717"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - tw(frame, 90, 10, 0, 1)}
            />
          </g>
          {/* arrowheads */}
          <g className="fill-border-subtle" fill="currentColor">
            <path d="M 1298 711 l 9 4 l -9 4 z" opacity={tw(frame, 104, 4, 0, 1)} />
            <path d="M 1438 711 l 9 4 l -9 4 z" opacity={tw(frame, 107, 4, 0, 1)} />
            <path d="M 1216 713 l -10 4 l 10 4 z" opacity={tw(frame, 99, 4, 0, 1)} />
          </g>

          {/* round ring — draws at the filing, turns one notch at the crank */}
          <g transform={`rotate(${ringTurn} ${TREE.xs[1]} ${TREE.y})`} opacity={tw(frame, B.ringAt, 6, 0, 1)}>
            <circle
              cx={TREE.xs[1]}
              cy={TREE.y}
              r={30}
              className="stroke-amber"
              stroke="currentColor"
              strokeWidth={2}
              pathLength={1}
              strokeDasharray={`${0.14 * ringDraw} ${1 - 0.14 * ringDraw}`}
              strokeDashoffset={0.02}
            />
          </g>
        </svg>

        {/* boundary label */}
        <div
          className="absolute rounded-full border border-border-subtle bg-raised px-3 py-1 font-mono text-xs tracking-[0.25em] text-text-secondary"
          style={{ left: 292, top: 268, opacity: tw(frame, 15, 8, 0, 1) }}
        >
          solana · on-chain
        </div>

        {/* accord program container */}
        <div
          className="absolute rounded-2xl border border-border-subtle bg-ink/30"
          style={{
            left: 300,
            top: 330,
            width: 880,
            height: 320,
            opacity: tw(frame, B.accordAt, 15, 0, 1),
            transform: `translateY(${tw(frame, B.accordAt, 15, 10, 0)}px)`,
          }}
        >
          <span className="absolute left-5 top-3.5 font-mono text-xs tracking-[0.35em] text-text-secondary">
            accord program
          </span>
        </div>

        {/* hero: Subaccord A, expanded — the five owned things */}
        <div className="absolute" style={{ left: 330, top: 375, width: 340 }}>
          <SubaccordCard
            frame={frame}
            title="Subaccord A"
            at={B.heroAt}
            internals={SUBACCORD_INTERNALS}
            internalsAt={B.heroAt + 10}
            stagger={3}
          />
          <RowFlash frame={frame} at={B.stakeFlashAt} row={0} tone="stake" />
          <RowFlash frame={frame} at={B.vrfHitAt} row={2} tone="fee" />
        </div>

        {/* collapsed stack — many, permissionless */}
        <div
          className="absolute"
          style={{ left: 720, top: 400, width: 300, transform: `translateY(${stackFloat}px)` }}
        >
          <SubaccordCard frame={frame} title="Subaccord B" at={B.stackAt[0]} collapsed />
          <div className="mt-3">
            <SubaccordCard frame={frame} title="Subaccord C" at={B.stackAt[1]} collapsed />
          </div>
          <p
            className="mt-4 font-mono text-xs text-muted-foreground"
            style={{ opacity: tw(frame, B.stackNoteAt, 10, 0, 1) }}
          >
            ⋮ many · permissionless — anyone may deploy one
          </p>
        </div>

        {/* dispute tree hanging below the program */}
        {["dispute", "round", "appeal bond"].map((label, i) => (
          <div key={label} className="absolute" style={{ left: TREE.xs[i], top: TREE.y - 15, translate: "-50% 0" }}>
            <StateNode
              frame={frame}
              label={label}
              at={B.disputesAt[i]}
              activeAt={
                i === 0 ? B.disputeHitAt : i === 1 ? B.ringAt : B.crankTurnAt + 4
              }
              settleAt={
                i === 0 ? B.disputeHitAt + 30 : i === 1 ? B.crankTurnAt + 12 : B.crankTurnAt + 40
              }
            />
          </div>
        ))}

        {/* boundary ledger — one cell per on-chain event */}
        <div className="absolute" style={{ left: 340, top: 810 }}>
          <ChainStrip
            frame={frame}
            cells={["slot 0", "stake", "a3f9c2d1", "vrf", "slot 4"]}
            appendAt={(i) => [B.ledgerAt, B.stakeFlashAt, B.disputeHitAt, B.vrfHitAt, B.crankTurnAt][i] ?? 0}
            highlight={2}
            highlightAt={B.disputeHitAt + 2}
            pulseAt={B.vrfHitAt}
            typePerChar={2}
            cellWidth={84}
            height={34}
          />
        </div>

        {/* jurors — off-chain, bottom-left */}
        <div className="absolute" style={{ left: 90, top: 612, transform: `translateY(${jurorBob}px)` }}>
          <JurorPool
            frame={frame - B.jurorsAt}
            count={3}
            cols={3}
            dotSize={14}
            label="jurors"
            drawnAt={(d) => B.jurorPopAt + d * 3 - B.jurorsAt}
          />
        </div>

        {/* arbitrable — a foreign program, bottom-right */}
        <div
          className="absolute"
          style={{
            left: 1640,
            top: 702,
            opacity: tw(frame, B.arbitrableAt, 10, 0, 1),
            transform: `translateY(${tw(frame, B.arbitrableAt, 10, 8, 0)}px)`,
          }}
        >
          <MonoChip tone="neutral" className="px-5 py-2.5 text-base">
            arbitrable
          </MonoChip>
        </div>

        {/* off-chain peers */}
        {PEERS.map((peer, i) => (
          <OffChainPeer key={peer.label} frame={frame} x={peer.x} label={peer.label} kind={peer.kind} at={72 + i * 3} />
        ))}

        {/* — flow beats — */}
        {/* stake: juror ① → vault ① */}
        <Packet
          frame={frame}
          from={{ x: 152, y: 648 }}
          to={{ x: 348, y: 424 }}
          at={B.stakeAt}
          dur={19}
          tone="stake"
        />
        <CheckpointFlash frame={frame} at={129} x={262} y={486} />
        <Sparkle frame={frame} at={B.stakeFlashAt + 5} x={656} y={486} />

        {/* file: arbitrable → dispute (amber coin) */}
        <Coin from={{ x: 1636, y: 730 }} to={{ x: 1210, y: 717 }} at={B.disputeAt} dur={21} />
        <CheckpointFlash frame={frame} at={165} x={1580} y={727} />

        {/* draw: vrf randomness → accumulator root */}
        <Packet frame={frame} from={{ x: 1060, y: 202 }} to={{ x: 600, y: 371 }} at={B.vrfAt + 2} dur={20} tone="stake" size={11} />
        <CheckpointFlash frame={frame} at={212} x={929} y={250} />

        {/* takeaway captions */}
        <Caption frame={frame} at={B.note1At} outAt={270}>
          a Subaccord owns exactly five things
        </Caption>
        <Caption frame={frame} at={B.note2At} dim>
          jurors stake in · Arbitrables file in · peers reach in
        </Caption>
      </div>
    </Scene>
  );
}
