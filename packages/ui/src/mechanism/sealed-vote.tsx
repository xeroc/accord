import type { FC } from "react";

import { cn } from "../internal/cn";
import { easeExpo, linear, tween } from "../internal/motion-math";
import { seededRandom } from "../internal/prng";

/** Deterministic text scramble — resolves to `target` once locked. */
function scramble(seed: string, frame: number, target: string, locked: boolean): string {
  if (locked) {
    return target;
  }
  const bucket = Math.floor(frame / 2);
  const HEX = "0123456789abcdef";
  return target
    .split("")
    .map((c, i) =>
      seededRandom(`${seed}:${i}:${bucket}`) > 0.45
        ? c
        : HEX[Math.floor(seededRandom(`${seed}:${i}:${bucket}:x`) * 16)],
    )
    .join("");
}

/**
 * SealedVote — the commit→reveal slot: a hash scrambles in at
 * `commitAt` and locks; at `revealAt` it flips away (rotateX) while the
 * vote flips in. Optionally recolors to `tone` at `toneAt` (coherent →
 * confirm, incoherent → slash) and draws the two red cross-out strokes
 * at `crossAt`. Layout via className (default fixed-height slot; chips
 * override with their own padding/height). Pure function of `frame`.
 */
export const SealedVote: FC<{
  frame: number;
  hash: string;
  vote: string;
  commitAt: number;
  revealAt: number;
  toneAt?: number;
  tone?: "confirm" | "slash";
  crossAt?: number;
  className?: string;
}> = ({ frame, hash, vote, commitAt, revealAt, toneAt, tone, crossAt, className }) => {
  const commitIn = tween(frame, [commitAt, commitAt + 6], [0, 1], easeExpo);
  const hashText = scramble(`hash:${hash}`, frame, hash, frame >= commitAt + 10);

  const hashFlip = tween(frame, [revealAt, revealAt + 7], [0, -72], easeExpo);
  const voteFlip = tween(frame, [revealAt + 2, revealAt + 9], [72, 0], easeExpo);
  const hashOp = tween(frame, [revealAt, revealAt + 4], [1, 0], linear);
  const voteOp = tween(frame, [revealAt + 2, revealAt + 7], [0, 1], linear);

  const toneMix =
    toneAt !== undefined ? tween(frame, [toneAt, toneAt + 8], [0, 1], easeExpo) : 0;

  const cross1 = crossAt !== undefined
    ? tween(frame, [crossAt, crossAt + 8], [0, 1], easeExpo)
    : 0;
  const cross2 = crossAt !== undefined
    ? tween(frame, [crossAt + 6, crossAt + 14], [0, 1], easeExpo)
    : 0;

  return (
    <div
      className={cn(
        "relative flex h-14 items-center justify-center overflow-hidden rounded-lg border border-border-subtle",
        className,
      )}
      style={{ perspective: 600 }}
    >
      {/* hash — in flow: sizes the box in auto-height (chip) layouts;
          centered by the container in fixed-height (slot) layouts */}
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
      {/* vote overlays — absolute, flipping over the hash */}
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-xl tracking-widest text-nearwhite"
        style={{
          opacity: voteOp * (1 - toneMix),
          transform: `rotateX(${voteFlip}deg)`,
        }}
      >
        {vote}
      </span>
      {tone ? (
        <span
          className={`absolute inset-0 flex items-center justify-center font-mono text-xl tracking-widest ${tone === "confirm" ? "text-confirm" : "text-slash"
            }`}
          style={{
            opacity: voteOp * toneMix,
            transform: `rotateX(${voteFlip}deg)`,
          }}
        >
          {vote}
        </span>
      ) : null}
      {crossAt !== undefined ? (
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
  );
};
