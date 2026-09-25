import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";

import { MonoChip, PanelLadder, RulingStamp, StateNode } from "@useaccord/ui";
import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { PhaseCaptions, StepRail } from "../../../src/shell/rail";
import {
  ACTORS,
  APPEAL_DRAW,
  APPEAL_SEGMENTS,
  APPEAL_X,
  BRANCH_LABELS,
  BRANCH_PULSE,
  CHIPS,
  CHECK,
  ENVELOPE,
  GEARS,
  GHOST,
  LADDER,
  LIT_SEGMENTS,
  NODES,
  PHASES,
  RULERS,
  RULING,
  SEATS,
  SPINE_D,
  TALLY_CHIP,
  TOKEN_BEATS,
  phaseAt,
  posAt,
} from "./lifecycle-map";

/** The proposal's --ease-accord-reveal: the one theatrical (Premium) curve. */
const EASE_REVEAL = Easing.bezier(0.4, 0.2, 0.2, 1);

/** Gravity for the envelope drop (paper falls accelerating). */

const EASE_FALL = Easing.bezier(0.55, 0, 1, 0.45);

/** How far along the spine the dispute token is at `frame`. */
function tokenDist(frame: number): number {
  const beat = TOKEN_BEATS.reduce((acc, b) => (frame >= b.from ? b : acc));
  return interpolate(frame, [beat.from, beat.to], [beat.d0, beat.d1], {
    easing: beat.linear ? Easing.linear : EASE_EXPO,
    ...clamp,
  });
}

// ---------------------------------------------------------------------------
// Scene-local staging pieces (kit deliberately lacks them — single-group).
// ---------------------------------------------------------------------------

/** Gear — the permissionless-crank glyph; rotates in mechanical 15° steps. */
function Gear({ frame, x, y, from, to }: { frame: number; x: number; y: number; from: number; to: number }) {
  const spin = interpolate(frame, [from, to], [0, 1], { easing: Easing.linear, ...clamp });
  const angle = Math.floor(spin * 6) * 15;
  const active = frame >= from && frame <= to + 8;
  return (
    <div
      className={`pointer-events-none absolute ${active ? "text-amber" : "text-muted-foreground"}`}
      style={{ left: x - 11, top: y - 11, opacity: interpolate(frame, [from - 8, from], [0, 1], { ...clamp }) }}
    >
      <svg width={22} height={22} viewBox="0 0 24 24" style={{ transform: `rotate(${angle}deg)` }}>
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k * Math.PI) / 4;
          return (
            <line
              key={k}
              x1={12 + 8.5 * Math.cos(a)}
              y1={12 + 8.5 * Math.sin(a)}
              x2={12 + 11 * Math.cos(a)}
              y2={12 + 11 * Math.sin(a)}
              stroke="currentColor"
              strokeWidth="2"
            />
          );
        })}
      </svg>
    </div>
  );
}

/** RulerStrip — one time window: ticks fill left→right (linear), label beneath. */
function RulerStrip({ frame, spec }: { frame: number; spec: (typeof RULERS)[number] }) {
  const fill = interpolate(frame, [spec.at, spec.at + spec.dur], [0, 1], {
    easing: Easing.linear,
    ...clamp,
  });
  const lit = Math.floor(fill * spec.ticks + 1e-6);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: spec.x,
        top: spec.y,
        width: spec.width,
        opacity: interpolate(frame, [spec.at - 8, spec.at], [0, 1], { easing: EASE_EXPO, ...clamp }),
      }}
    >
      <div className="flex justify-between">
        {Array.from({ length: spec.ticks }, (_, i) => (
          <div
            key={i}
            data-tick={i}
            className={`h-3 w-[2px] rounded-full ${i < lit ? "bg-amber" : "bg-border-subtle"}`}
          />
        ))}
      </div>
      <div className="relative mt-[3px] h-px bg-border-subtle">
        <div data-fill className="absolute inset-y-0 left-0 bg-amber" style={{ width: `${fill * 100}%` }} />
      </div>
      <div
        className={`mt-1.5 font-mono text-xs text-muted-foreground ${
          spec.labelAtRight ? "text-right" : "text-center"
        }`}
      >
        {spec.label}
      </div>
    </div>
  );
}

/** DisputeToken — the hexagonal case walking the machine. */
function DisputeToken({
  x,
  y,
  scale,
  opacity,
  glow,
}: {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  glow: number;
}) {
  const HEX = "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: x,
        top: y,
        width: 30,
        height: 34,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity,
      }}
    >
      <div
        className="absolute inset-[-10px] rounded-full"
        style={{ background: "var(--accord-amber)", filter: "blur(14px)", opacity: glow }}
      />
      <div className="absolute inset-0 bg-amber/40" style={{ clipPath: HEX, transform: "scale(1.3)" }} />
      <div className="absolute inset-0 bg-amber" style={{ clipPath: HEX }} />
    </div>
  );
}

/** BeatChip — the acting party, igniting from the left, exiting after its beat. */
function BeatChip({ frame, spec }: { frame: number; spec: (typeof CHIPS)[number] }) {
  const enter = interpolate(frame, [spec.at, spec.at + 7], [0, 1], { easing: EASE_EXPO, ...clamp });
  const exit = interpolate(frame, [spec.exit, spec.exit + 8], [1, 0], { easing: EASE_EXPO, ...clamp });
  const op = enter * exit;
  if (op <= 0.02) return null;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: spec.x,
        top: spec.y,
        opacity: op,
        transform: `translate(${spec.anchorRight ? "-100%" : "-50%"}, -50%) translateX(${(1 - enter) * 10}px)`,
      }}
    >
      <MonoChip tone={spec.tone} className="px-3.5 py-1 text-sm">
        {spec.text}
      </MonoChip>
    </div>
  );
}

/** EnvelopeGlyph — the sealed-vote micro annotation (sealed ⇄ open face-swap). */
function EnvelopeGlyph({ open, opacity }: { open: number; opacity: number }) {
  return (
    <svg width={30} height={24} viewBox="0 0 30 24" fill="none" style={{ opacity, display: "block" }}>
      <rect
        x="1"
        y="1"
        width="28"
        height="22"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-border-subtle"
      />
      {open > 0.5 ? (
        // opened: letter risen, flap up
        <rect x="5" y="3" width="20" height="12" rx="1" className="fill-raised stroke-amber" strokeWidth="1.5" />
      ) : (
        // sealed: wax V flap
        <path d="M 2 2 L 15 12 L 28 2" fill="none" stroke="currentColor" strokeWidth="2" className="text-border-subtle" />
      )}
    </svg>
  );
}

/** CheckDraw — Closed's terminal check, stroked on. */
function CheckDraw({ frame, at, x, y }: { frame: number; at: number; x: number; y: number }) {
  const p = interpolate(frame, [at, at + 8], [0, 1], { easing: EASE_EXPO, ...clamp });
  if (p <= 0) return null;
  return (
    <svg
      width={30}
      height={24}
      viewBox="0 0 30 24"
      className="pointer-events-none absolute text-confirm"
      style={{ left: x - 15, top: y - 12 }}
    >
      <path
        d="M 4 12 L 11 19 L 26 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="square"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - p}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------

/**
 * B1 — the dispute state machine. One token walks the exact
 * DisputeState spine while StateNodes ignite, rulers meter the time
 * windows, gears mark the permissionless cranks, and the appeal ghost
 * rides the loop back to a doubled panel.
 */
export function LifecycleScene() {
  const frame = useCurrentFrame();

  const dist = tokenDist(frame);
  const pos = posAt(dist);
  const ignite = interpolate(frame, [18, 30], [0, 1], { easing: EASE_EXPO, ...clamp });
  const bounce =
    frame >= 187 && frame < 272 ? 1.5 * Math.abs(Math.sin((Math.PI * (frame - 187)) / 27)) : 0;
  const breath = 0.3 + 0.12 * Math.sin((2 * Math.PI * frame) / 90);

  // appeal edge draw-on + ghost
  const appealP = interpolate(frame, [APPEAL_DRAW.from, APPEAL_DRAW.to], [0, 1], {
    easing: EASE_REVEAL,
    ...clamp,
  });
  const appealTotal = APPEAL_SEGMENTS.reduce((sum, s) => sum + (s.y0 - s.y1), 0);
  const ghostP = interpolate(frame, [GHOST.from, GHOST.to], [0, 1], { easing: EASE_EXPO, ...clamp });
  const ghostOp = interpolate(frame, [GHOST.to, GHOST.dissolveTo], [0.4, 0], { ...clamp });
  const ripple = interpolate(frame, [GHOST.rippleAt, GHOST.rippleAt + 12], [0, 1], { ...clamp });

  // side-exit pulse (one beat, then back to side-note dim)
  const branchOp = interpolate(
    frame,
    [BRANCH_PULSE.from, BRANCH_PULSE.from + 4, BRANCH_PULSE.to, BRANCH_PULSE.to + 8],
    [0.65, 1, 1, 0.78],
    { easing: EASE_EXPO, ...clamp },
  );

  // end-of-path glow
  const glowUp = interpolate(frame, [330, 360], [0, 1], { easing: EASE_EXPO, ...clamp });

  // envelope micro-beats
  const dropP = interpolate(frame, [ENVELOPE.commitDrop.from, ENVELOPE.commitDrop.to], [0, 1], {
    easing: EASE_FALL,
    ...clamp,
  });
  const squash =
    frame >= ENVELOPE.commitDrop.to
      ? 1 -
        0.08 *
          Math.sin(
            Math.PI *
              interpolate(frame, [ENVELOPE.commitDrop.to, ENVELOPE.commitDrop.to + 5], [0, 1], {
                easing: Easing.linear,
                ...clamp,
              }),
          )
      : 1;
  const envelopeIn = interpolate(frame, [ENVELOPE.commitDrop.from - 10, ENVELOPE.commitDrop.from], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const revealEnvOpen = interpolate(frame, [ENVELOPE.revealOpen.at, ENVELOPE.revealOpen.at + 8], [0, 1], {
    easing: EASE_REVEAL,
    ...clamp,
  });

  const tallyPop = interpolate(frame, [TALLY_CHIP.at, TALLY_CHIP.at + 8], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });

  return (
    <Scene seed="lifecycle">
      {/* headline + phase rail */}
      <Interactive.Div
        name="B1 headline"
        className="absolute left-24 top-10 font-heading text-4xl font-bold text-nearwhite"
        style={{ opacity: interpolate(frame, [4, 20], [0, 1], { easing: EASE_EXPO, ...clamp }) }}
      >
        Who can do what, when.
      </Interactive.Div>
      <div className="absolute inset-x-0 top-[108px]">
        <StepRail steps={PHASES.map((p) => ({ label: p.label, frames: p.frames }))} />
      </div>

      {/* the map: edges under nodes, all currentColor (tokens only) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1920 1080"
        fill="none"
      >
        {/* base spine + side exits */}
        <g className="text-border-subtle" opacity={0.55} strokeWidth={2}>
          <path d={SPINE_D} stroke="currentColor" />
        </g>

        {/* branch cluster (edges + labels + nodes pulse together) */}
        <g opacity={branchOp} className="text-border-subtle">
          <path d="M 270 786 L 270 906" stroke="currentColor" strokeDasharray="6 6" />
          <path d="M 178 940 C 118 896 118 464 204 400" stroke="currentColor" strokeDasharray="6 6" />
          <path d="M 362 940 L 582 940" stroke="currentColor" strokeDasharray="6 6" />
          <polygon points="270,916 265,906 275,906" fill="currentColor" />
          <polygon points="590,940 580,935 580,945" fill="currentColor" />
          <polygon points="206,400 216,395 216,405" fill="currentColor" />
        </g>

        {/* the lit path — amber overlays drawing behind the token */}
        <g className="text-amber">
          {LIT_SEGMENTS.map((seg, i) => {
            const p = interpolate(frame, [seg.from, seg.to], [0, 1], {
              easing: seg.linear ? Easing.linear : EASE_EXPO,
              ...clamp,
            });
            return (
              <path
                key={i}
                data-lit={i}
                d={seg.d}
                stroke="currentColor"
                strokeWidth={2 + glowUp * 0.8}
                opacity={0.65 + glowUp * 0.3}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
              />
            );
          })}
        </g>

        {/* the appeal loop — premium beat, draws itself upward */}
        <g className="text-amber" opacity={0.85}>
          {APPEAL_SEGMENTS.map((seg, i) => {
            const segLen = seg.y0 - seg.y1;
            const prefix = APPEAL_SEGMENTS.slice(0, i).reduce((acc, s) => acc + (s.y0 - s.y1), 0);
            const p = interpolate(appealP, [prefix / appealTotal, (prefix + segLen) / appealTotal], [0, 1], {
              ...clamp,
            });
            return (
              <path
                key={i}
                data-appeal={i}
                d={`M ${APPEAL_X} ${seg.y0} L ${APPEAL_X} ${seg.y1}`}
                stroke="currentColor"
                strokeWidth={2}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - p}
              />
            );
          })}
          <polygon
            points={`${APPEAL_X},424 ${APPEAL_X - 5},434 ${APPEAL_X + 5},434`}
            fill="currentColor"
            opacity={interpolate(frame, [APPEAL_DRAW.to - 2, APPEAL_DRAW.to], [0, 1], { ...clamp })}
          />
        </g>
      </svg>

      {/* map labels for the side exits */}
      {BRANCH_LABELS.map((l) => (
        <div
          key={l.text}
          className="pointer-events-none absolute font-mono text-xs text-muted-foreground"
          style={{
            left: l.x,
            top: l.y,
            transform: "translate(-50%, -50%)",
            opacity:
              interpolate(frame, [24, 32], [0, 1], { easing: EASE_EXPO, ...clamp }) * branchOp,
          }}
        >
          {l.text}
        </div>
      ))}

      {/* stations — exact DisputeState names */}
      {NODES.map((n) => (
        <div
          key={n.label}
          className="absolute"
          style={{ left: n.x, top: n.y, transform: "translate(-50%, -50%)" }}
        >
          <StateNode
            frame={frame}
            label={n.label}
            at={n.at}
            activeAt={n.activeAt}
            settleAt={n.settleAt}
            className={
              n.label === "RedrawEligible" || n.label === "Failed" ? "px-4 py-1.5 text-sm" : "px-6 py-2.5 text-lg"
            }
          />
        </div>
      ))}

      {/* the drawn panel — three juror seats pop around Drawn */}
      {SEATS.xs.map((x, i) => (
        <div
          key={x}
          data-seat={i}
          className="absolute h-2.5 w-2.5 rounded-full bg-amber"
          style={{
            left: x,
            top: SEATS.y,
            opacity: interpolate(frame, [SEATS.at + i * SEATS.stagger, SEATS.at + i * SEATS.stagger + 3], [0, 1], {
              ...clamp,
            }),
            transform: `translate(-50%, -50%) scale(${interpolate(
              frame,
              [SEATS.at + i * SEATS.stagger, SEATS.at + i * SEATS.stagger + 4],
              [0.4, 1],
              { easing: EASE_EXPO, ...clamp },
            )})`,
            boxShadow: "0 0 8px var(--accord-amber)",
          }}
        />
      ))}

      {/* gears, rulers, chips */}
      {GEARS.map((g) => (
        <Gear key={g.id} frame={frame} x={g.x} y={g.y} from={g.from} to={g.to} />
      ))}
      {RULERS.map((r) => (
        <RulerStrip key={r.id} frame={frame} spec={r} />
      ))}
      {CHIPS.map((c) => (
        <BeatChip key={c.text} frame={frame} spec={c} />
      ))}

      {/* envelope micro-glyphs: sealed drop at Commit, flip-open at Reveal */}
      <div
        className="absolute"
        style={{
          left: ENVELOPE.commitDrop.x,
          top: ENVELOPE.commitDrop.y0 + (ENVELOPE.commitDrop.y1 - ENVELOPE.commitDrop.y0) * dropP,
          transform: `translate(-50%, -50%) scaleY(${squash})`,
          opacity: envelopeIn,
        }}
      >
        <EnvelopeGlyph open={0} opacity={1} />
      </div>
      <div
        className="absolute text-border-subtle"
        style={{
          left: ENVELOPE.revealOpen.x,
          top: ENVELOPE.revealOpen.y,
          transform: "translate(-50%, -50%)",
        }}
      >
        <EnvelopeGlyph
          open={revealEnvOpen}
          opacity={interpolate(frame, [ENVELOPE.revealOpen.at - 4, ENVELOPE.revealOpen.at], [0, 1], {
            easing: EASE_EXPO,
            ...clamp,
          })}
        />
      </div>

      {/* badges: tally ✓, appeal ladder 3→7, the Ruling, Closed's check */}
      {tallyPop > 0 ? (
        <div
          className="pointer-events-none absolute"
          style={{
            left: TALLY_CHIP.x,
            top: TALLY_CHIP.y,
            transform: `translate(-50%, -50%) scale(${0.6 + tallyPop * 0.4})`,
            opacity: tallyPop,
          }}
        >
          <MonoChip tone="confirm" className="px-3.5 py-1 text-sm">
            ✓ tallied
          </MonoChip>
        </div>
      ) : null}
      <div className="pointer-events-none absolute" style={{ left: LADDER.x, top: LADDER.y }}>
        <PanelLadder frame={frame} steps={[3, 7]} at={LADDER.at} stagger={9} stepHeight={15} dotSize={5} labels={["3", "7"]} />
      </div>
      <div className="pointer-events-none absolute" style={{ left: RULING.x, top: RULING.y, transform: "translate(-50%, -50%)" }}>
        <RulingStamp frame={frame} text="RULING" at={RULING.at} size="md" />
      </div>
      <CheckDraw frame={frame} at={CHECK.at} x={CHECK.x} y={CHECK.y} />

      {/* the ghost appeal — RoundResolved → Drawn, dissolving at the top */}
      {frame >= GHOST.from && frame < GHOST.dissolveTo ? (
        <DisputeToken
          x={APPEAL_X}
          y={interpolate(ghostP, [0, 1], [736, 428])}
          scale={0.85}
          opacity={ghostOp}
          glow={0.15}
        />
      ) : null}

      {/* ghost landing ripple at Drawn */}
      {ripple > 0 && ripple < 1 ? (
        <div
          className="pointer-events-none absolute rounded-full border border-amber"
          style={{
            left: 780,
            top: 400,
            width: 36,
            height: 36,
            transform: `translate(-50%, -50%) scale(${0.6 + ripple * 0.9})`,
            opacity: (1 - ripple) * 0.8,
          }}
        />
      ) : null}

      {/* the dispute token itself */}
      {frame >= 18 ? (
        <Interactive.Div name="Dispute token" className="pointer-events-none absolute inset-0">
          <DisputeToken x={pos.x} y={pos.y - bounce} scale={ignite} opacity={ignite} glow={breath * ignite} />
        </Interactive.Div>
      ) : null}

      {/* bottom chrome: group kicker + who-acts-now captions */}
      <div className="absolute bottom-8 left-24 font-mono text-sm text-muted-foreground">
        b1 · the dispute state machine
      </div>
      <div className="absolute inset-x-0 bottom-7 flex justify-center">
        <PhaseCaptions labels={[...ACTORS]} active={phaseAt(frame)} />
      </div>
    </Scene>
  );
}
