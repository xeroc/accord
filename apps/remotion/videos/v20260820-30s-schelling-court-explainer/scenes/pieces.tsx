import {
  Easing,
  Interactive,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO, SPRING } from "../../../src/shell/presets";
import {
  BEAT,
  DURATION_IN_FRAMES,
  ECON,
  HEADLINE,
  JURORS,
  LAYOUT,
  POOL_SIZE,
  STEPS,
  T,
  cardX,
  type JurorCast,
  type Phase,
} from "./timeline";

const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** Deterministic text scramble — resolves to `target` once locked. */
function scramble(seed: string, frame: number, target: string, locked: boolean) {
  if (locked) {
    return target;
  }
  const bucket = Math.floor(frame / 2);
  const HEX = "0123456789abcdef";
  return target
    .split("")
    .map((c, i) =>
      random(`${seed}:${i}:${bucket}`) > 0.45
        ? c
        : HEX[Math.floor(random(`${seed}:${i}:${bucket}:x`) * 16)],
    )
    .join("");
}

/** Spring input: 0 before `from`, then frames elapsed. */
const since = (frame: number, from: number) => Math.max(0, frame - from);

export interface Pt {
  x: number;
  y: number;
}

/**
 * Headline — the one-word beat marker above the illustration.
 * Cross-fades with a short slide at every phase boundary; the word's
 * color follows the story (slash red, profit green, ruling amber).
 */
export function Headline() {
  const frame = useCurrentFrame();
  let cur: Phase = "draw";
  for (const p of STEPS) {
    if (frame >= T[p]) {
      cur = p;
    }
  }
  const idx = STEPS.indexOf(cur);
  const next = idx >= 0 ? STEPS[idx + 1] : undefined;
  const start = T[cur] + 2;
  const end = next ? T[next] : DURATION_IN_FRAMES;
  const fadesOut = end < DURATION_IN_FRAMES;
  const op = fadesOut
    ? interpolate(frame, [start, start + 7, end - 7, end], [0, 1, 1, 0], clamp)
    : interpolate(frame, [start, start + 7], [0, 1], clamp);
  const y = interpolate(frame, [start, start + 7], [16, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const tone =
    cur === "slash"
      ? "text-slash"
      : cur === "profit"
        ? "text-confirm"
        : cur === "ruling"
          ? "text-amber"
          : "text-nearwhite";
  return (
    <Interactive.Div
      name="Beat headline"
      className={`absolute left-0 right-0 text-center font-heading text-6xl font-bold tracking-[0.08em] ${tone}`}
      style={{ top: LAYOUT.headlineY, opacity: op, transform: `translateY(${y}px)` }}
    >
      {HEADLINE[cur]}
    </Interactive.Div>
  );
}

/**
 * JurorCard — one jury seat. Materializes at its draw beat, seals a
 * hash at commit, flips to a vote at reveal, takes the fee, and
 * resolves its stake economics at slash/profit. The incoherent
 * minority (index 2) gets its vote crossed out.
 */
export function JurorCard({ juror, i }: { juror: JurorCast; i: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const drawAt = BEAT.drawAt(i);
  const commitAt = BEAT.commitAt(i);
  const revealAt = BEAT.revealAt(i);

  // entrance — materialize as its pool dot pops
  const enter = interpolate(frame, [drawAt, drawAt + 10], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const enterY = interpolate(frame, [drawAt, drawAt + 10], [48, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });

  // commit — hash scrambles, then locks
  const commitIn = interpolate(frame, [commitAt, commitAt + 6], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const hashText = scramble(
    `hash:${juror.short}`,
    frame,
    juror.hash,
    frame >= commitAt + 10,
  );

  // reveal — the hash flips away, the vote flips in from its edge
  const hashFlip = interpolate(frame, [revealAt, revealAt + 7], [0, -72], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const voteFlip = interpolate(frame, [revealAt + 2, revealAt + 9], [72, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const hashOp = interpolate(frame, [revealAt, revealAt + 4], [1, 0], clamp);
  const voteOp = interpolate(frame, [revealAt + 2, revealAt + 7], [0, 1], clamp);

  // vote tone: neutral at reveal; economics phases apply color
  const tone = juror.coherent
    ? interpolate(
        frame,
        [BEAT.profitChipAt(i), BEAT.profitChipAt(i) + 8],
        [0, 1],
        { easing: EASE_EXPO, ...clamp },
      )
    : interpolate(frame, [BEAT.slashAt + 6, BEAT.slashAt + 14], [0, 1], {
        easing: EASE_EXPO,
        ...clamp,
      });

  // cross-out — two red strokes draw over the incoherent vote
  const cross1 = juror.coherent
    ? 0
    : interpolate(frame, [BEAT.crossAt, BEAT.crossAt + 8], [0, 1], {
        easing: EASE_EXPO,
        ...clamp,
      });
  const cross2 = juror.coherent
    ? 0
    : interpolate(frame, [BEAT.crossAt + 6, BEAT.crossAt + 14], [0, 1], {
        easing: EASE_EXPO,
        ...clamp,
      });

  // stake bar: incoherent shrinks 100->60, coherent grows 100->110
  const stakePct = juror.coherent
    ? interpolate(
        frame,
        [BEAT.profitCoinAt(i) + 18, BEAT.profitCoinAt(i) + 36],
        [100, 110],
        { easing: EASE_EXPO, ...clamp },
      )
    : interpolate(
        frame,
        [BEAT.stakeShrinkAt, BEAT.stakeShrinkAt + 20],
        [100, 60],
        { easing: EASE_EXPO, ...clamp },
      );

  // error shake — incoherent card only, 3 oscillations in ~0.5s
  const shake = juror.coherent
    ? 0
    : interpolate(
        frame,
        [BEAT.slashAt, BEAT.slashAt + 3, BEAT.slashAt + 7, BEAT.slashAt + 11, BEAT.slashAt + 15],
        [0, 7, -5, 3, 0],
        clamp,
      );

  // slash glow — a red pulse that lands with the shake, then simmers
  const slashGlow = juror.coherent
    ? 0
    : interpolate(
        frame,
        [BEAT.slashAt, BEAT.slashAt + 8, BEAT.slashAt + 36],
        [0, 26, 9],
        clamp,
      );

  // chips pop as their coin lands
  const feePop = spring({
    frame: since(frame, BEAT.feeCoinAt(i) + 12),
    fps,
    config: SPRING.snappy,
  });
  const deltaPop = juror.coherent
    ? spring({ frame: since(frame, BEAT.profitChipAt(i)), fps, config: SPRING.snappy })
    : spring({ frame: since(frame, BEAT.stakeShrinkAt + 12), fps, config: SPRING.snappy });

  const borderCls = !juror.coherent && frame >= BEAT.slashAt + 6
    ? "border-slash/60"
    : juror.coherent && frame >= BEAT.profitChipAt(i)
      ? "border-confirm/40"
      : "border-border-subtle";

  // staging: the whole court recedes when the Ruling stamps in
  const rulingDim = interpolate(frame, [605, 625], [1, 0.45], clamp);

  return (
    <Interactive.Div
      name={`Juror ${juror.short}`}
      className={`absolute rounded-xl border bg-raised p-5 ${borderCls}`}
      style={{
        left: cardX(i),
        top: LAYOUT.juryY,
        width: LAYOUT.cardW,
        height: LAYOUT.cardH,
        opacity: enter * rulingDim,
        transform: `translateY(${enterY}px) translateX(${shake}px)`,
        boxShadow: slashGlow > 0 ? `0 0 ${slashGlow}px var(--color-slash)` : undefined,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="h-2.5 w-2.5 rounded-full border border-amber bg-amber/30" />
        <span className="font-mono text-sm text-text-secondary">
          juror {juror.short}
        </span>
      </div>

      {/* commit / reveal slot */}
      <div
        className="relative mt-3 h-14 overflow-hidden rounded-lg border border-border-subtle"
        style={{ perspective: 600 }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono text-lg text-body"
            style={{
              opacity: hashOp * commitIn,
              transform: `rotateX(${hashFlip}deg)`,
            }}
          >
            <span className="text-amber">#</span>
            {hashText}
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center font-mono text-xl tracking-widest text-nearwhite"
            style={{
              opacity: voteOp * (1 - tone),
              transform: `rotateX(${voteFlip}deg)`,
            }}
          >
            {juror.vote}
          </span>
          <span
            className={`absolute inset-0 flex items-center justify-center font-mono text-xl tracking-widest ${
              juror.coherent ? "text-confirm" : "text-slash"
            }`}
            style={{
              opacity: voteOp * tone,
              transform: `rotateX(${voteFlip}deg)`,
            }}
          >
            {juror.vote}
          </span>
        </div>
        {/* cross-out strokes over the incoherent vote */}
        {!juror.coherent ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="absolute h-[3px] w-[62%] rounded-full bg-slash"
              style={{ transform: `scaleX(${cross1}) rotate(16deg)` }}
            />
            <div
              className="absolute h-[3px] w-[62%] rounded-full bg-slash"
              style={{ transform: `scaleX(${cross2}) rotate(-16deg)` }}
            />
          </div>
        ) : null}
      </div>

      {/* stake */}
      <div className="mt-4 flex items-center justify-between font-mono text-xs text-muted-foreground">
        <span>stake</span>
        <span>{Math.round(stakePct)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-amber"
          style={{ width: `${stakePct}%` }}
        />
      </div>

      {/* fee chip */}
      <div
        className="absolute bottom-3 left-4 rounded-full border border-amber/50 bg-amber/10 px-2.5 py-1 font-mono text-xs text-amber"
        style={{ opacity: feePop, transform: `scale(${0.6 + feePop * 0.4})` }}
      >
        +{ECON.feeEach} fee
      </div>

      {/* delta chip — slashed stake out / redistributed stake in */}
      {juror.coherent ? (
        <div
          className="absolute bottom-3 right-4 rounded-full border border-confirm/50 bg-confirm/10 px-2.5 py-1 font-mono text-xs text-confirm"
          style={{ opacity: deltaPop, transform: `scale(${0.6 + deltaPop * 0.4})` }}
        >
          +{ECON.profitEach} stake
        </div>
      ) : (
        <div
          className="absolute bottom-3 right-4 rounded-full border border-slash/50 bg-slash/10 px-2.5 py-1 font-mono text-xs text-slash"
          style={{ opacity: deltaPop, transform: `scale(${0.6 + deltaPop * 0.4})` }}
        >
          −{ECON.slashTotal} stake
        </div>
      )}
    </Interactive.Div>
  );
}

/**
 * Pool — the staked juror pool. Assembles, then five dots pop Verdict
 * Amber (no scan, no movement); once the jury is seated the whole pool
 * fades away.
 */
export function Pool() {
  const frame = useCurrentFrame();

  const inOp = interpolate(frame, [BEAT.poolIn, BEAT.poolIn + 15], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const inY = interpolate(frame, [BEAT.poolIn, BEAT.poolIn + 15], [24, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const out = interpolate(frame, [BEAT.poolFade, BEAT.poolFade + 18], [1, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });

  return (
    <Interactive.Div
      name="Juror pool"
      className="absolute"
      style={{
        left: "50%",
        top: 752,
        opacity: inOp * out,
        transform: `translateX(-50%) translateY(${inY}px)`,
      }}
    >
      <div className="mb-3 text-center font-mono text-xs tracking-[0.25em] text-muted-foreground">
        STAKED POOL · {POOL_SIZE}
      </div>
      <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-3.5">
        {Array.from({ length: POOL_SIZE }, (_, d) => {
          const jurorIndex = JURORS.findIndex((j) => j.poolDot === d);
          const drawn = jurorIndex >= 0;
          const at = BEAT.drawAt(Math.max(jurorIndex, 0));
          const pop = drawn
            ? interpolate(frame, [at, at + 4, at + 9], [0, 1, 0.75], clamp)
            : 0;
          return (
            <div key={d} className="relative h-2.5 w-2.5">
              <div
                className="absolute inset-0 rounded-full bg-border-subtle"
                style={{ opacity: 1 - pop }}
              />
              {drawn ? (
                <div
                  className="absolute inset-0 rounded-full bg-amber"
                  style={{
                    opacity: pop,
                    scale: String(0.5 + pop * 0.9),
                    boxShadow: "0 0 12px var(--color-amber)",
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Interactive.Div>
  );
}

/** Coin — an amber token arcing between two points. */
export function Coin({
  from,
  to,
  at,
  dur = 16,
}: {
  from: Pt;
  to: Pt;
  at: number;
  dur?: number;
}) {
  const frame = useCurrentFrame();
  if (frame < at || frame > at + dur) {
    return null;
  }
  const t = interpolate(frame, [at, at + dur], [0, 1], {
    easing: Easing.bezier(0.45, 0, 0.25, 1),
    ...clamp,
  });
  const yMid = Math.min(from.y, to.y) - 64;
  const x = from.x + (to.x - from.x) * t;
  const y = interpolate(t, [0, 0.5, 1], [from.y, yMid, to.y], clamp);
  const op = interpolate(
    frame,
    [at, at + 2, at + dur - 2, at + dur],
    [0, 1, 1, 0],
    clamp,
  );
  const s = interpolate(frame, [at, at + 3], [0.4, 1], clamp);
  return (
    <div
      className="absolute h-3.5 w-3.5 rounded-full"
      style={{
        left: x,
        top: y,
        translate: "-50% -50%",
        opacity: op,
        scale: String(s),
        backgroundColor: "var(--color-amber)",
        boxShadow: "0 0 10px var(--color-amber)",
      }}
    />
  );
}

/** Vault — the filer's fee, paying every drawn juror. */
export function Vault() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: since(frame, BEAT.vaultIn),
    fps,
    config: SPRING.snappy,
  });
  const paid = Math.round(
    interpolate(frame, [330, 362], [ECON.feeTotal, 0], clamp),
  );
  const op = interpolate(
    frame,
    [BEAT.vaultIn, BEAT.vaultIn + 4, 385, 395],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <Interactive.Div
      name="Fee vault"
      className="absolute rounded-full border border-amber/40 bg-amber/10 px-6 py-2.5 font-mono text-sm text-amber"
      style={{
        left: 960,
        top: LAYOUT.vaultY,
        opacity: op,
        transform: `translateX(-50%) scale(${0.7 + s * 0.3})`,
      }}
    >
      filing fee · {paid}
    </Interactive.Div>
  );
}

/** Pot — slashed stake accumulating, then redistributing. */
export function Pot() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: since(frame, BEAT.potIn),
    fps,
    config: SPRING.snappy,
  });
  const amount = Math.round(
    frame < BEAT.profitCoinAt(0)
      ? interpolate(frame, [BEAT.potIn, BEAT.potIn + 26], [0, ECON.slashTotal], clamp)
      : interpolate(
          frame,
          [BEAT.profitCoinAt(0), BEAT.profitCoinAt(0) + 35],
          [ECON.slashTotal, 0],
          clamp,
        ),
  );
  const glow = interpolate(frame, [T.profit, T.profit + 12], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const op = interpolate(
    frame,
    [BEAT.potIn, BEAT.potIn + 5, 575, 590],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <Interactive.Div
      name="Redistribution pot"
      className="absolute rounded-full border border-amber/40 bg-amber/5 px-6 py-2.5 font-mono text-sm text-amber"
      style={{
        left: 960,
        top: LAYOUT.potY,
        opacity: op,
        transform: `translateX(-50%) translateY(${(1 - s) * 16}px)`,
        boxShadow: `0 0 ${8 + glow * 22}px var(--color-amber)`,
      }}
    >
      redistribution · {amount}
    </Interactive.Div>
  );
}

/** Tally — the vote count assembling after reveal. */
export function Tally() {
  const frame = useCurrentFrame();
  const op = interpolate(
    frame,
    [BEAT.tallyGrow, BEAT.tallyGrow + 10, 605, 620],
    [0, 1, 1, 0],
    clamp,
  );
  const yesW = interpolate(
    frame,
    [BEAT.tallyGrow, BEAT.tallyGrow + 28],
    [0, 716],
    { easing: EASE_EXPO, ...clamp },
  );
  const noW = interpolate(
    frame,
    [BEAT.tallyGrow + 5, BEAT.tallyGrow + 30],
    [0, 176],
    { easing: EASE_EXPO, ...clamp },
  );
  return (
    <Interactive.Div
      name="Vote tally"
      className="absolute"
      style={{ left: 960, top: LAYOUT.tallyY, opacity: op, transform: "translateX(-50%)" }}
    >
      <div className="flex h-3 w-[900px] gap-1">
        <div
          className="h-full rounded-full bg-amber"
          style={{ width: yesW, boxShadow: "0 0 14px var(--color-amber)" }}
        />
        <div
          className="h-full rounded-full bg-nearwhite/25"
          style={{ width: noW }}
        />
      </div>
      <div className="mt-2 flex w-[900px] justify-between font-mono text-xs tracking-[0.2em]">
        <span className="text-amber">YES · 4</span>
        <span className="text-muted-foreground">NO · 1</span>
      </div>
    </Interactive.Div>
  );
}

/** Stamp — the Ruling lands: the hero moment. */
export function Stamp() {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [BEAT.stampAt, BEAT.stampAt + 7], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const scale = interpolate(frame, [BEAT.stampAt, BEAT.stampAt + 8], [1.6, 1], {
    easing: EASE_EXPO,
    output: "perceptual-scale",
    ...clamp,
  });
  const rotate = interpolate(frame, [BEAT.stampAt, BEAT.stampAt + 8], [-4, -2], {
    easing: EASE_EXPO,
    ...clamp,
  });
  return (
    <div className="absolute left-0 right-0" style={{ top: 430 }}>
      <Interactive.Div
        name="Ruling stamp"
        className="mx-auto w-fit rounded-md border-2 border-amber px-12 py-5 font-mono text-5xl tracking-[0.2em] text-amber"
        style={{
          opacity: op,
          transform: `scale(${scale}) rotate(${rotate}deg)`,
          boxShadow: "0 0 34px var(--color-amber)",
        }}
      >
        RULING: YES
      </Interactive.Div>
    </div>
  );
}
