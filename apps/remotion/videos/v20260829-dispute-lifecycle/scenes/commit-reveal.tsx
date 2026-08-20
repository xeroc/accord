import { Easing, Interactive, interpolate, random, useCurrentFrame } from "remotion";

import { AccordMark, ChainStrip, MonoChip, SealedVote } from "@useaccord/ui";
import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** Sine ease-in-out (the convergence drift — never a primary action). */
const EASE_SINE = Easing.bezier(0.37, 0, 0.63, 1);
/** Gravity for the envelope drops. */
const EASE_FALL = Easing.bezier(0.55, 0, 1, 0.45);

/** The jury. 7f2a and b81c converge on YES; e49d stays apart. */
const CAST = [
  { short: "7f2a", hash: "a3f9c2d1", vote: "yes", salt: "9f3a71" },
  { short: "b81c", hash: "7b219ee4", vote: "yes", salt: "c07d24" },
  { short: "e49d", hash: "0dd45f9b", vote: "no", salt: "9b1e58" },
] as const;

type Juror = (typeof CAST)[number];

// ---------------------------------------------------------------------------
// Timeline (frames, scene-local) — phases gated, not chosen.
// ---------------------------------------------------------------------------

const T = {
  panelsIn: 0,
  avatarsAt: (i: number) => 15 + i * 2,
  summonAt: (i: number) => 24 + i * 2,
  dropAt: (i: number) => 33 + i * 5,
  commitAt: (i: number) => 44 + i * 5,
  cellAt: (i: number) => 48 + i * 5,
  copycatIn: 58,
  darts: { from: 62, to: 84 },
  questionAt: [68, 74],
  emptyAt: 80,
  copycatDim: 88,
  wallGlowAt: 90,
  caretFrom: 92,
  caretTo: 104,
  panel2At: 96,
  programWakeAt: 104,
  revealAt: (i: number) => 110 + i * 6,
  revealCellAt: (i: number) => 114 + i * 6,
  cardRiseAt: (i: number) => 112 + i * 6,
  pipelineAt: (i: number) => 124 + i * 6,
  slideAt: (i: number) => 128 + i * 6,
  matchAt: (i: number) => 136 + i * 6,
  tickAt: (i: number) => 144 + i * 6,
  convergeFrom: 168,
  convergeTo: 186,
  convergeChipAt: 176,
  closingAt: 205,
} as const;

// ---------------------------------------------------------------------------
// Layout — absolute coordinates on the 1920×1080 canvas.
// ---------------------------------------------------------------------------

const PANELS = {
  p1: { x: 96, y: 250, w: 784, h: 410 },
  p2: { x: 1040, y: 250, w: 784, h: 410 },
} as const;

const AVATAR_Y = 370;
const AVATAR_XS = [260, 490, 720] as const;
const SLOT_FINAL_TOP = 590;
const SLOT_SUMMON_TOP = 450;
const SLOT_DROP = SLOT_FINAL_TOP - SLOT_SUMMON_TOP; // 140px fall

const STRIP = { left: 540, y: 660, cellW: 130, link: 12 } as const;
/** Center x of strip cell i. */
const cellCenter = (i: number) => STRIP.left + i * (STRIP.cellW + STRIP.link) + STRIP.cellW / 2;

const CARD_XS = [1180, 1430, 1680] as const;
const CARD_TOP = 425;
const CARD_W = 190;

const PROGRAM = { x: 1242, y: 302, w: 380, h: 96 } as const;

const INSET = { x: 760, y: 760, w: 400, h: 240 } as const;

const PHASE_1_X = 480;
const PHASE_2_X = 1432;
const TRACK_Y = 232;

// ---------------------------------------------------------------------------
// Staging pieces.
// ---------------------------------------------------------------------------

/** One juror avatar — a seal-owning circle, mono-labeled by short key. */
function JurorAvatar({ frame, juror, x, i }: { frame: number; juror: Juror; x: number; i: number }) {
  const at = T.avatarsAt(i);
  const enter = interpolate(frame, [at, at + 6], [0, 1], { easing: EASE_EXPO, ...clamp });
  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: AVATAR_Y,
        transform: `translate(-50%, -50%) translateY(${(1 - enter) * 16}px)`,
        opacity: enter,
      }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border-subtle bg-raised font-mono text-sm text-text-secondary">
        {juror.short}
      </div>
    </div>
  );
}

/** The commit envelope: summons under its juror, then falls to the strip. */
function CommitEnvelope({ frame, juror, x, i }: { frame: number; juror: Juror; x: number; i: number }) {
  const summonAt = T.summonAt(i);
  const dropAt = T.dropAt(i);
  const top =
    frame < dropAt
      ? interpolate(frame, [summonAt, summonAt + 6], [SLOT_SUMMON_TOP + 20, SLOT_SUMMON_TOP], {
          easing: EASE_EXPO,
          ...clamp,
        })
      : SLOT_SUMMON_TOP +
        SLOT_DROP * interpolate(frame, [dropAt, dropAt + 10], [0, 1], { easing: EASE_FALL, ...clamp });
  const settle =
    frame >= dropAt + 10
      ? 1 -
        0.07 *
          Math.sin(
            Math.PI *
              interpolate(frame, [dropAt + 10, dropAt + 15], [0, 1], { easing: Easing.linear, ...clamp }),
          )
      : 1;
  const glow = interpolate(frame, [T.wallGlowAt, T.wallGlowAt + 4, T.wallGlowAt + 12], [0, 0.5, 0], {
    easing: Easing.linear,
    ...clamp,
  });
  return (
    <div
      className="absolute"
      style={{
        left: x,
        top,
        transform: `translateX(-50%) scaleY(${settle})`,
        opacity: interpolate(frame, [summonAt, summonAt + 5], [0, 1], { easing: EASE_EXPO, ...clamp }),
        boxShadow: glow > 0 ? `0 0 ${22 * glow}px var(--accord-amber)` : undefined,
        borderRadius: 12,
      }}
    >
      <SealedVote
        frame={frame}
        hash={juror.hash.slice(0, 6)}
        vote={juror.vote}
        commitAt={T.commitAt(i)}
        revealAt={T.revealAt(i)}
        className="w-[200px] rounded-lg bg-raised"
      />
    </div>
  );
}

/** The revealed {vote, salt} card, rising as its envelope flips open. */
function VoteCard({ frame, juror, x, i }: { frame: number; juror: Juror; x: number; i: number }) {
  const at = T.cardRiseAt(i);
  const rise = interpolate(frame, [at, at + 9], [0, 1], { easing: EASE_EXPO, ...clamp });
  const converge =
    i < 2
      ? interpolate(frame, [T.convergeFrom, T.convergeTo], [0, i === 0 ? 7 : -7], {
          easing: EASE_SINE,
          ...clamp,
        })
      : 0;
  const lit = interpolate(frame, [T.convergeFrom, T.convergeTo], [0, 1], { easing: EASE_SINE, ...clamp });
  return (
    <div
      className="absolute"
      style={{
        left: x + converge,
        top: CARD_TOP + (1 - rise) * 24,
        width: CARD_W,
        transform: "translateX(-50%)",
        opacity: rise,
      }}
    >
      <div
        className={`rounded-lg border bg-raised p-3.5 font-mono ${
          i < 2 && lit > 0.5 ? "border-amber/40" : "border-border-subtle"
        }`}
      >
        <div className="text-base text-nearwhite">
          vote: <span className="text-amber">{juror.vote}</span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">salt: {juror.salt}</div>
      </div>
    </div>
  );
}

/** The Accord program node: re-hashes every opening against its seal. */
function ProgramNode({ frame }: { frame: number }) {
  const wake = interpolate(frame, [T.programWakeAt, T.programWakeAt + 8], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  // The hash stage compresses once per card it verifies.
  const squeeze = CAST.reduce((peak, _, i) => {
    const t = interpolate(frame, [T.pipelineAt(i), T.pipelineAt(i) + 6], [0, 1], {
      easing: Easing.linear,
      ...clamp,
    });
    return Math.max(peak, Math.sin(Math.PI * t));
  }, 0);
  return (
    <div
      className={`absolute flex items-center gap-5 rounded-lg border bg-raised/50 px-6 ${
        wake > 0.5 ? "border-amber/40" : "border-border-subtle"
      }`}
      style={{
        left: PROGRAM.x,
        top: PROGRAM.y,
        width: PROGRAM.w,
        height: PROGRAM.h,
        opacity: interpolate(frame, [T.panel2At, T.panel2At + 8], [0, 1], {
          easing: EASE_EXPO,
          ...clamp,
        }),
        boxShadow: wake > 0 ? `0 0 ${18 * wake}px var(--accord-amber)` : undefined,
      }}
    >
      <AccordMark size={36} progress={interpolate(frame, [T.panel2At, T.panel2At + 14], [0, 1], { ...clamp })} />
      <div className="flex flex-col gap-2">
        <div className="font-mono text-sm text-text-secondary">accord · program</div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-muted-foreground">{"{vote, salt}"}</span>
          <span className="text-muted-foreground">→</span>
          <span
            className="rounded border border-border-subtle bg-raised px-2 py-0.5 text-amber"
            style={{ transform: `scaleY(${1 - squeeze * 0.35})` }}
          >
            hash
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="text-muted-foreground">commit slot</span>
        </div>
      </div>
    </div>
  );
}

/** The copycat inset — scans the sealed wall, finds nothing, dims. */
function CopycatInset({ frame }: { frame: number }) {
  const enter = interpolate(frame, [T.copycatIn, T.copycatIn + 7], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const dim = interpolate(frame, [T.copycatDim, T.copycatDim + 8], [1, 0.45], { ...clamp });
  const darting = frame >= T.darts.from && frame < T.darts.to;
  const bucket = Math.floor((frame - T.darts.from) / 4);
  const gazeX = darting ? 942 + 130 * random(`copycat:${bucket}`) : 1010;
  return (
    <div
      className="absolute rounded-xl border border-border-subtle bg-raised/30"
      style={{
        left: INSET.x,
        top: INSET.y,
        width: INSET.w,
        height: INSET.h,
        opacity: enter * dim,
        transform: `translateY(${(1 - enter) * 14}px)`,
      }}
    >
      <div className="mt-4 text-center font-mono text-xs tracking-[0.25em] text-muted-foreground">
        the copycat
      </div>
      {/* narrowed eyes, looking right */}
      <svg width={72} height={72} viewBox="0 0 72 72" className="absolute" style={{ left: 68, top: 76 }}>
        <circle cx="36" cy="36" r="33" fill="none" stroke="currentColor" strokeWidth="2" className="text-border-subtle" />
        <line x1="20" y1="30" x2="33" y2="35" stroke="currentColor" strokeWidth="2.5" className="text-text-secondary" />
        <line x1="52" y1="30" x2="39" y2="35" stroke="currentColor" strokeWidth="2.5" className="text-text-secondary" />
        <line x1="26" y1="50" x2="46" y2="50" stroke="currentColor" strokeWidth="2" className="text-border-subtle" />
      </svg>
      {/* the sealed wall it scans */}
      <div className="absolute flex gap-3" style={{ left: 168, top: 96 }}>
        {CAST.map((c, i) => (
          <svg key={c.short} width={38} height={28} viewBox="0 0 38 28">
            <rect
              x="1"
              y="1"
              width="36"
              height="26"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-border-subtle"
            />
            <path d="M 2 2 L 19 13 L 36 2" fill="none" stroke="currentColor" strokeWidth="2" className="text-border-subtle" data-i={i} />
          </svg>
        ))}
      </div>
      {/* the darting gaze */}
      <div
        className="absolute w-[2px] bg-nearwhite"
        style={{
          left: gazeX - INSET.x,
          top: 88,
          height: 60,
          opacity: darting ? 0.9 : 0.25,
        }}
      />
      {/* ? bubbles, then the empty set */}
      <div className="absolute flex gap-2" style={{ left: 168, top: 36 }}>
        {T.questionAt.map((q, k) => (
          <MonoChip
            key={k}
            tone="neutral"
            className="px-2 py-0.5"
            style={{
              opacity: interpolate(frame, [q, q + 3], [0, 1], { ...clamp }) *
                interpolate(frame, [T.emptyAt, T.emptyAt + 5], [1, 0.35], { ...clamp }),
            }}
          >
            ?
          </MonoChip>
        ))}
        <span
          className="font-mono text-lg text-text-secondary"
          style={{ opacity: interpolate(frame, [T.emptyAt, T.emptyAt + 5], [0, 1], { ...clamp }) }}
        >
          ∅
        </span>
      </div>
      <div
        className="absolute font-mono text-sm text-muted-foreground"
        style={{
          left: 168,
          top: 176,
          opacity: interpolate(frame, [T.emptyAt, T.emptyAt + 6], [0, 1], { ...clamp }),
        }}
      >
        nothing to copy — no visible votes
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The scene.
// ---------------------------------------------------------------------------

/**
 * B2 — commit-reveal. Phase one seals hash(vote, salt) onto the chain
 * (nothing to copy); phase two opens {vote, salt} while the program
 * re-hashes each opening and matches it to its commit slot. The
 * copycat inset is the punchline; the scalar footnote is the asterisk.
 */
export function CommitRevealScene() {
  const frame = useCurrentFrame();

  const caretX = interpolate(frame, [T.caretFrom, T.caretTo], [PHASE_1_X, PHASE_2_X], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const phase1Op = interpolate(frame, [T.caretFrom, T.caretTo], [1, 0.3], { ...clamp });
  const phase2Op = interpolate(frame, [T.caretFrom, T.caretTo], [0.3, 1], { ...clamp });

  // offset breathing so the two panel frames never sync
  const breathe1 = 1 + 0.005 * Math.sin((2 * Math.PI * frame) / 120);
  const breathe2 = 1 + 0.005 * Math.sin((2 * Math.PI * frame) / 120 + Math.PI);

  return (
    <Scene seed="commit-reveal">
      {/* headline */}
      <Interactive.Div
        name="B2 headline"
        className="absolute left-24 top-12 font-heading text-5xl font-bold text-nearwhite"
        style={{ opacity: interpolate(frame, [2, 18], [0, 1], { easing: EASE_EXPO, ...clamp }) }}
      >
        Why votes are sealed.
      </Interactive.Div>
      <div
        className="absolute left-24 top-[124px] font-mono text-xl text-text-secondary"
        style={{ opacity: interpolate(frame, [8, 24], [0, 1], { easing: EASE_EXPO, ...clamp }) }}
      >
        commit · hash(vote, salt) → reveal · {"{vote, salt}"}
      </div>

      {/* phase caret row */}
      <div
        className="absolute w-fit font-mono text-lg tracking-[0.2em]"
        style={{ left: PHASE_1_X, top: 196, transform: "translateX(-50%)", opacity: phase1Op }}
      >
        <span className="text-amber">1 · COMMIT</span>
      </div>
      <div
        className="absolute w-fit font-mono text-lg tracking-[0.2em]"
        style={{ left: PHASE_2_X, top: 196, transform: "translateX(-50%)", opacity: phase2Op }}
      >
        <span className="text-amber">2 · REVEAL</span>
      </div>
      <div className="absolute h-px bg-border-subtle" style={{ left: PHASE_1_X, top: TRACK_Y, width: PHASE_2_X - PHASE_1_X }} />
      <div
        className="absolute h-2.5 w-2.5 bg-amber"
        style={{
          left: caretX,
          top: TRACK_Y + 1,
          transform: `translateX(-50%) rotate(45deg)`,
          opacity: interpolate(frame, [0, 8], [0, 1], { ...clamp }),
        }}
      />

      {/* the two phase panels */}
      <div
        className="absolute rounded-2xl border border-border-subtle bg-raised/20"
        style={{ left: PANELS.p1.x, top: PANELS.p1.y, width: PANELS.p1.w, height: PANELS.p1.h, scale: String(breathe1) }}
      />
      <div
        className="absolute rounded-2xl border border-border-subtle bg-raised/20"
        style={{ left: PANELS.p2.x, top: PANELS.p2.y, width: PANELS.p2.w, height: PANELS.p2.h, scale: String(breathe2) }}
      />

      {/* panel headers */}
      <div
        className="absolute font-mono text-lg tracking-[0.2em] text-text-secondary"
        style={{
          left: PANELS.p1.x + 44,
          top: 272,
          opacity: interpolate(frame, [15, 23], [0, 1], { easing: EASE_EXPO, ...clamp }),
          transform: `translateX(${(1 - interpolate(frame, [15, 23], [0, 1], { easing: EASE_EXPO, ...clamp })) * 10}px)`,
        }}
      >
        1 · COMMIT
      </div>
      <div
        className="absolute font-mono text-lg tracking-[0.2em] text-text-secondary"
        style={{
          left: PANELS.p2.x + 44,
          top: 272,
          opacity: interpolate(frame, [T.panel2At, T.panel2At + 8], [0, 1], { easing: EASE_EXPO, ...clamp }),
          transform: `translateX(${(1 - interpolate(frame, [T.panel2At, T.panel2At + 8], [0, 1], { easing: EASE_EXPO, ...clamp })) * 10}px)`,
        }}
      >
        2 · REVEAL — {"{vote, salt}"}
      </div>

      {/* panel 1: jurors, envelopes */}
      {CAST.map((juror, i) => (
        <JurorAvatar key={juror.short} frame={frame} juror={juror} x={AVATAR_XS[i] ?? 0} i={i} />
      ))}
      {CAST.map((juror, i) => (
        <CommitEnvelope key={juror.short} frame={frame} juror={juror} x={AVATAR_XS[i] ?? 0} i={i} />
      ))}

      {/* panel 2: program node + rising vote cards */}
      <ProgramNode frame={frame} />
      {CAST.map((juror, i) => (
        <VoteCard key={juror.short} frame={frame} juror={juror} x={CARD_XS[i] ?? 0} i={i} />
      ))}

      {/* match lines: each opening hashed back to its commit slot */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1920 1080" fill="none">
        {CAST.map((c, i) => {
          const p = interpolate(frame, [T.matchAt(i), T.matchAt(i) + 10], [0, 1], {
            easing: EASE_EXPO,
            ...clamp,
          });
          return (
            <path
              key={c.short}
              data-match={i}
              d={`M ${CARD_XS[i] ?? 0} ${CARD_TOP + 95} L ${cellCenter(i)} ${STRIP.y - 4}`}
              stroke="currentColor"
              strokeWidth={1.5}
              className="text-confirm"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - p}
              opacity={0.8}
            />
          );
        })}
      </svg>

      {/* recomputed hash chips sliding card → commit slot */}
      {CAST.map((c, i) => {
        const p = interpolate(frame, [T.slideAt(i), T.slideAt(i) + 8], [0, 1], {
          easing: EASE_EXPO,
          ...clamp,
        });
        const op =
          p > 0 && p < 1
            ? Math.min(1, Math.min(p, 1 - p) * 4)
            : 0;
        if (op <= 0) return null;
        return (
          <div
            key={c.short}
            className="pointer-events-none absolute font-mono text-xs text-amber"
            style={{
              left: interpolate(p, [0, 1], [CARD_XS[i] ?? 0, cellCenter(i)]),
              top: interpolate(p, [0, 1], [CARD_TOP + 60, STRIP.y - 24]),
              transform: "translate(-50%, -50%)",
              opacity: op,
            }}
          >
            #{c.hash.slice(0, 6)}
          </div>
        );
      })}

      {/* the chain strip: commit slots, then the reveal cells appending */}
      <div className="absolute" style={{ left: STRIP.left, top: STRIP.y }}>
        <ChainStrip
          frame={frame}
          cells={[...CAST.map((c) => c.hash), "vote·salt", "vote·salt", "vote·salt"]}
          cellWidth={STRIP.cellW}
          appendAt={(i) => (i < 3 ? T.cellAt(i) : T.revealCellAt(i - 3))}
          typePerChar={2}
          shimmerAt={T.revealAt(0)}
        />
      </div>

      {/* ✓ ticks landing on the commit slots */}
      {CAST.map((c, i) => {
        const pop = interpolate(frame, [T.tickAt(i), T.tickAt(i) + 5], [0, 1], {
          easing: EASE_EXPO,
          ...clamp,
        });
        if (pop <= 0) return null;
        return (
          <div
            key={c.short}
            className="pointer-events-none absolute"
            style={{
              left: cellCenter(i) + 52,
              top: STRIP.y - 14,
              transform: `translate(-50%, -50%) scale(${0.5 + pop * 0.5})`,
              opacity: pop,
            }}
          >
            <MonoChip tone="confirm" className="px-2 py-0.5">
              ✓
            </MonoChip>
          </div>
        );
      })}

      {/* convergence caption */}
      <div
        className="pointer-events-none absolute"
        style={{
          left: CARD_XS[2],
          top: 598,
          transform: "translateX(-50%)",
          opacity: interpolate(frame, [T.convergeChipAt, T.convergeChipAt + 8], [0, 1], {
            easing: EASE_EXPO,
            ...clamp,
          }),
        }}
      >
        <MonoChip tone="amber" className="px-3.5 py-1 text-sm">
          the schelling point forms
        </MonoChip>
      </div>

      {/* the copycat inset */}
      <CopycatInset frame={frame} />

      {/* scalar preimage footnote — static, never animates past its entrance */}
      <div
        className="absolute w-[600px] font-mono text-sm leading-relaxed text-muted-foreground"
        style={{
          left: 1216,
          top: 788,
          opacity: interpolate(frame, [4, 14], [0, 1], { easing: EASE_EXPO, ...clamp }),
        }}
      >
        <div>scalar (median) disputes widen the preimage:</div>
        <div className="mt-1 text-text-secondary">hash(vote_le8 ‖ salt ‖ juror)</div>
        <div className="mt-1">
          the commit hash is bound to the juror — one juror&rsquo;s seal can&rsquo;t be copied by another.
        </div>
      </div>

      {/* closing line */}
      <div
        className="absolute inset-x-0 text-center font-mono text-xl text-text-secondary"
        style={{
          top: 1026,
          opacity: interpolate(frame, [T.closingAt, T.closingAt + 10], [0, 1], {
            easing: EASE_EXPO,
            ...clamp,
          }),
        }}
      >
        sealed independently → opened verifiably → converged
      </div>
    </Scene>
  );
}
