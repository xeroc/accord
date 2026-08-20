import {
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO, SPRING } from "../../../src/shell/presets";
import { clamp, since } from "../../../src/shell/anim";
import { JurorPool } from "../../../src/pieces/juror-pool";
import { SealedVote } from "../../../src/pieces/sealed-vote";
import { RulingStamp } from "../../../src/pieces/ruling-stamp";
import { DeltaChip, MonoChip } from "../../../src/pieces/chips";
import { TallyBar } from "../../../src/pieces/tally";

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

  // entrance — materialize as its pool dot pops
  const enter = interpolate(frame, [drawAt, drawAt + 10], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const enterY = interpolate(frame, [drawAt, drawAt + 10], [48, 0], {
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
      <SealedVote
        hash={juror.hash}
        vote={juror.vote}
        commitAt={BEAT.commitAt(i)}
        revealAt={BEAT.revealAt(i)}
        tone={juror.coherent ? "confirm" : "slash"}
        toneAt={juror.coherent ? BEAT.profitChipAt(i) : BEAT.slashAt + 6}
        crossAt={juror.coherent ? undefined : BEAT.crossAt}
        className="mt-3"
      />

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
      <DeltaChip
        tone="amber"
        sign="+"
        amount={ECON.feeEach}
        label="fee"
        pop={feePop}
        className="absolute bottom-3 left-4"
      />

      {/* delta chip — slashed stake out / redistributed stake in */}
      {juror.coherent ? (
        <DeltaChip
          tone="confirm"
          sign="+"
          amount={ECON.profitEach}
          label="stake"
          pop={deltaPop}
          className="absolute bottom-3 right-4"
        />
      ) : (
        <DeltaChip
          tone="slash"
          sign="−"
          amount={ECON.slashTotal}
          label="stake"
          pop={deltaPop}
          className="absolute bottom-3 right-4"
        />
      )}
    </Interactive.Div>
  );
}


/**
 * Pool — the staked juror pool (framework JurorPool): assembles, five
 * dots pop Verdict Amber, then the whole pool fades away once the jury
 * is seated.
 */
export function Pool() {
  return (
    <Interactive.Div
      name="Juror pool"
      className="absolute"
      style={{ left: "50%", top: 752, transform: "translateX(-50%)" }}
    >
      <JurorPool
        count={POOL_SIZE}
        cols={15}
        drawnAt={(d) => {
          const j = JURORS.findIndex((x) => x.poolDot === d);
          return j >= 0 ? BEAT.drawAt(j) : undefined;
        }}
        fadeAt={BEAT.poolFade}
        label={`STAKED POOL · ${POOL_SIZE}`}
      />
    </Interactive.Div>
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
    <MonoChip
      tone="amber"
      className="absolute border-amber/40 px-6 py-2.5 text-sm"
      style={{ left: 960, top: LAYOUT.vaultY, opacity: op, transform: `translateX(-50%) scale(${0.7 + s * 0.3})` }}
    >
      filing fee · {paid}
    </MonoChip>
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
    <MonoChip
      tone="amber"
      className="absolute border-amber/40 bg-amber/5 px-6 py-2.5 text-sm"
      style={{
        left: 960,
        top: LAYOUT.potY,
        opacity: op,
        transform: `translateX(-50%) translateY(${(1 - s) * 16}px)`,
        boxShadow: `0 0 ${8 + glow * 22}px var(--color-amber)`,
      }}
    >
      redistribution · {amount}
    </MonoChip>
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
  return (
    <Interactive.Div
      name="Vote tally"
      className="absolute"
      style={{ left: 960, top: LAYOUT.tallyY, opacity: op, transform: "translateX(-50%)" }}
    >
      <TallyBar yes={4} no={1} at={BEAT.tallyGrow} width={900} />
    </Interactive.Div>
  );
}

/** Stamp — the Ruling lands: the hero moment. */
export function Stamp() {
  return (
    <div className="absolute left-0 right-0" style={{ top: 430 }}>
      <Interactive.Div name="Ruling stamp" className="mx-auto w-fit">
        <RulingStamp text="RULING: YES" at={BEAT.stampAt} />
      </Interactive.Div>
    </div>
  );
}

