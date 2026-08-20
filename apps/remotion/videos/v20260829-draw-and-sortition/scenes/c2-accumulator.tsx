import type { ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import {
  DeltaChip,
  LedgerCounter,
  MerkleSumTree,
  MonoChip,
} from "@useaccord/ui";
import { clamp, enterAt, scramble } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";
import { BeatCopy, SceneChrome, expo } from "./chrome";
import { C2_LEAVES, T2 } from "./timeline";

/**
 * C2Accumulator — the MST accumulator: root on-chain, tree off-chain.
 *
 * Two worlds: the 45-byte on-chain account card and the big off-chain
 * MerkleSumTree. A stake event updates one leaf and the kit tree ripples
 * it up the ancestor path in discrete hops; the on-chain root_hash and
 * total_stake tick ~80 ms after the root hop (consequence, not
 * simultaneity). A second, compressed event proves the pattern
 * generalizes, then the historical inset strikes out the old
 * posted-snapshot model. Event 2 is a prop window over the same kit
 * piece (leaves rebalanced, path moved) — the tree never re-assembles.
 */

const TREE_X = 720;
const TREE_Y = 270;
const TREE_W = 620;
const TREE_H = 380;

/** Post-event-1 stakes (leaf 3 baked at 80) for the event-2 window. */
const LEAVES_AFTER_EV1 = [120, 80, 140, 80, 200, 160, 90, 150] as const;

const HEX1 = "9c17e4a2f0b8";
const HEX2 = "5e83c1d9a47f";

/**
 * ArcChip — a Δ chip arcing between two canvas points with the proposal's
 * 8 px wind-up (anticipation) and a shallow parabolic apex.
 */
function ArcChip({
  frame,
  from,
  to,
  at,
  dur,
  apex = 20,
  children,
}: {
  frame: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  at: number;
  dur: number;
  apex?: number;
  children: ReactNode;
}) {
  if (frame < at - 4 || frame > at + dur) {
    return null;
  }
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const dirX = (from.x - to.x) / len;
  const dirY = (from.y - to.y) / len;
  const windup = interpolate(frame, [at - 4, at], [8, 0], { ...clamp });
  const t = expo(frame, at, dur);
  const x = from.x + (to.x - from.x) * t + dirX * windup;
  const y = from.y + (to.y - from.y) * t + dirY * windup - Math.sin(Math.PI * t) * apex;
  const op = interpolate(frame, [at, at + 2, at + dur - 2, at + dur], [0, 1, 1, 0], {
    ...clamp,
  });
  return (
    <div className="absolute" style={{ left: x, top: y, translate: "-50% -50%", opacity: op }}>
      {children}
    </div>
  );
}

/** RootHashRow — the on-chain root_hash field: scramble-odometer + flash. */
function RootHashRow({ frame }: { frame: number }) {
  const target = frame >= T2.rootHashRe2 ? HEX2 : HEX1;
  const locked =
    (frame >= T2.rootHashLock && frame < T2.rootHashRe2) || frame >= T2.rootHashLock2;
  const flash = Math.max(
    frame >= T2.rootHashLock
      ? interpolate(frame, [T2.rootHashLock, T2.rootHashLock + 8], [1, 0], { ...clamp })
      : 0,
    frame >= T2.rootHashLock2
      ? interpolate(frame, [T2.rootHashLock2, T2.rootHashLock2 + 8], [1, 0], { ...clamp })
      : 0,
  );
  return (
    <div className="relative flex items-center justify-between gap-8 rounded-md px-2.5 py-1.5 font-mono text-xs">
      {flash > 0 ? (
        <div className="pointer-events-none absolute inset-0 rounded-md bg-amber/15" style={{ opacity: flash }} />
      ) : null}
      <span className="text-muted-foreground">root_hash</span>
      <span className="tabular-nums tracking-wider text-text-secondary">
        {scramble("c2-root", frame, target, locked)}
      </span>
    </div>
  );
}

/** CanonicalCheck — the ✓ that stroke-draws once the new root lands. */
function CanonicalCheck({ frame }: { frame: number }) {
  const draw = expo(frame, T2.checkAt, 8);
  if (draw <= 0) {
    return null;
  }
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 font-mono text-xs text-confirm">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 9 L7 13 L13 4"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
          className="stroke-confirm"
          strokeWidth={2}
          fill="none"
          strokeLinecap="square"
        />
      </svg>
      <span>canonical</span>
    </div>
  );
}

/** SnapshotInset — the replaced model: posted snapshot + bond + fraud
 * window, struck through and dimmed. Nothing to withhold or fabricate. */
function SnapshotInset({ frame, fps }: { frame: number; fps: number }) {
  const e = enterAt(frame, fps, T2.insetAt / 30, 0.45);
  const dim = interpolate(frame, [T2.insetDimAt, T2.insetDimAt + 10], [1, 0.4], { ...clamp });
  const strike = expo(frame, T2.strikeAt, 11);
  return (
    <div
      className="absolute rounded-xl border border-border-subtle bg-raised/40 p-5 font-mono"
      style={{ left: 150, top: 726, width: 360, opacity: e * dim, transform: `translateY(${(1 - e) * 16}px)` }}
    >
      <div className="text-xs tracking-[0.25em] text-muted-foreground">BEFORE · POSTED SNAPSHOT</div>
      <div className="relative mt-4 flex items-center gap-3">
        <span style={{ opacity: enterAt(frame, fps, T2.bondAt / 30, 0.25) }}>
          <MonoChip tone="neutral">bond</MonoChip>
        </span>
        <span style={{ opacity: enterAt(frame, fps, T2.fraudAt / 30, 0.25) }}>
          <MonoChip tone="neutral">fraud window</MonoChip>
        </span>
        <div
          className="absolute left-0 right-0 top-1/2 h-[2px] origin-left bg-slash"
          style={{ transform: `scaleX(${strike})` }}
        />
      </div>
      <p
        className="mt-4 text-sm leading-relaxed text-text-secondary"
        style={{ opacity: enterAt(frame, fps, T2.insetCapAt / 30, 0.4) }}
      >
        root canonical by construction — nothing to withhold or fabricate
      </p>
    </div>
  );
}

export function C2Accumulator() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ev2 = frame >= T2.update2At;

  return (
    <Scene seed="draw-sortition-c2">
      <SceneChrome active={1} frames={345} />

      {/* the on-chain world — 45 bytes */}
      <div
        className="absolute rounded-xl border border-border-subtle bg-raised/60 p-6 font-mono"
        style={{
          left: 200,
          top: 316,
          width: 372,
          opacity: enterAt(frame, fps, T2.cardAt / 30, 0.4),
          transform: `translateY(${(1 - enterAt(frame, fps, T2.cardAt / 30, 0.4)) * -12}px)`,
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="text-xs tracking-[0.25em] text-muted-foreground">
            ACCUMULATOR · ON-CHAIN
          </span>
          <MonoChip tone="neutral">45 bytes</MonoChip>
        </div>
        <RootHashRow frame={frame} />
        {frame < T2.stakeTick2 ? (
          <LedgerCounter
            frame={frame}
            label="total_stake"
            from={1000}
            to={1020}
            at={T2.stakeTick1}
            tone="confirm"
          />
        ) : (
          <LedgerCounter
            frame={frame}
            label="total_stake"
            from={1020}
            to={1004}
            at={T2.stakeTick2}
          />
        )}
        <LedgerCounter frame={frame} label="next_index" to={8} flash={false} />
        <LedgerCounter frame={frame} label="depth" to={3} flash={false} />
        <CanonicalCheck frame={frame} />
      </div>

      {/* the divider between the two worlds */}
      <div
        className="absolute w-px origin-top bg-border-subtle"
        style={{ left: 630, top: 300, height: 400, transform: `scaleY(${expo(frame, T2.dividerAt, 10)})` }}
      />

      {/* the off-chain world — the full tree (one kit piece, two windows) */}
      <div className="absolute" style={{ left: TREE_X, top: TREE_Y }}>
        <MerkleSumTree
          frame={frame}
          leaves={ev2 ? LEAVES_AFTER_EV1 : C2_LEAVES}
          at={T2.at}
          updateLeaf={ev2 ? 6 : 3}
          updateAt={ev2 ? T2.update2At : T2.update1At}
          updateTo={ev2 ? 74 : 80}
          hopDur={ev2 ? 9 : 15}
          frostAt={T2.frostAt}
          rootLabel="root · 45 B"
          width={TREE_W}
          height={TREE_H}
        />
      </div>
      <p
        className="absolute font-mono text-sm tracking-[0.2em] text-muted-foreground"
        style={{ left: TREE_X, top: TREE_Y - 26, opacity: enterAt(frame, fps, 1.2, 0.4) }}
      >
        OFF-CHAIN · FULL TREE · HELD BY INDEXERS
      </p>
      <div
        className="absolute"
        style={{ left: TREE_X + TREE_W + 16, top: TREE_Y + 90, opacity: enterAt(frame, fps, T2.frozenTagAt / 30, 0.3) }}
      >
        <MonoChip tone="neutral">off-path · frozen</MonoChip>
      </div>
      <div
        className="absolute"
        style={{ left: TREE_X + 60, top: TREE_Y + TREE_H + 44, opacity: enterAt(frame, fps, T2.ologAt / 30, 0.35) }}
      >
        <MonoChip tone="amber">O(log N) — one path, not the tree</MonoChip>
      </div>

      {/* the two stake events arcing into their leaves (from below-right,
          clear of the caption row) */}
      <ArcChip frame={frame} from={{ x: 1330, y: 790 }} to={{ x: 956, y: 612 }} at={T2.chip1At} dur={14}>
        <DeltaChip tone="confirm" sign="+" amount={20} label="stake" pop={1} className="text-sm" />
      </ArcChip>
      <ArcChip frame={frame} from={{ x: 1330, y: 790 }} to={{ x: 1204, y: 612 }} at={T2.chip2At} dur={10}>
        <DeltaChip tone="slash" sign="−" amount={16} label="stake" pop={1} className="text-sm" />
      </ArcChip>

      <SnapshotInset frame={frame} fps={fps} />

      <BeatCopy at={0.8} out={2.9} copy="45 bytes on-chain" sub="the account holds root_hash + total_stake — indexers hold the tree" />
      <BeatCopy at={3.2} out={4.87} copy="One stake, one path" sub="stake +Δ updates one leaf — the change re-hashes its ancestors hop by hop" />
      <BeatCopy at={5.2} out={6.8} copy="Any leaf, same locality" sub="unstake is the same machinery in reverse — the root absorbs every update" />
      <BeatCopy at={7.73} copy="Nothing to withhold" sub="root canonical by construction — no posted snapshot, bond, or fraud window" />
    </Scene>
  );
}
