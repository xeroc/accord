import type { FC } from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { EASE_EXPO } from "../shell/presets";
import { clamp, scramble } from "../shell/anim";
import { cn } from "../shell/cn";

/**
 * SealedVote — the commit→reveal slot: a hash scrambles in at
 * `commitAt` and locks; at `revealAt` it flips away (rotateX) while the
 * vote flips in. Optionally recolors to `tone` at `toneAt` (coherent →
 * confirm, incoherent → slash) and draws the two red cross-out strokes
 * at `crossAt`. Layout via className (default is the fixed-height slot;
 * chips override with their own padding/height).
 */
export const SealedVote: FC<{
  hash: string;
  vote: string;
  commitAt: number;
  revealAt: number;
  /** frame the vote text takes its economics tone (0 = neutral → colored) */
  toneAt?: number;
  tone?: "confirm" | "slash";
  crossAt?: number;
  className?: string;
}> = ({ hash, vote, commitAt, revealAt, toneAt, tone, crossAt, className }) => {
  const frame = useCurrentFrame();

  const commitIn = interpolate(frame, [commitAt, commitAt + 6], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const hashText = scramble(
    `hash:${hash}`,
    frame,
    hash,
    frame >= commitAt + 10,
  );

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

  const toneMix =
    toneAt !== undefined
      ? interpolate(frame, [toneAt, toneAt + 8], [0, 1], {
          easing: EASE_EXPO,
          ...clamp,
        })
      : 0;

  const cross1 = crossAt
    ? interpolate(frame, [crossAt, crossAt + 8], [0, 1], {
        easing: EASE_EXPO,
        ...clamp,
      })
    : 0;
  const cross2 = crossAt
    ? interpolate(frame, [crossAt + 6, crossAt + 14], [0, 1], {
        easing: EASE_EXPO,
        ...clamp,
      })
    : 0;

  return (
    <div
      className={cn("relative h-14 overflow-hidden rounded-lg border border-border-subtle", className)}
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
            opacity: voteOp * (1 - toneMix),
            transform: `rotateX(${voteFlip}deg)`,
          }}
        >
          {vote}
        </span>
        {tone ? (
          <span
            className={`absolute inset-0 flex items-center justify-center font-mono text-xl tracking-widest ${
              tone === "confirm" ? "text-confirm" : "text-slash"
            }`}
            style={{
              opacity: voteOp * toneMix,
              transform: `rotateX(${voteFlip}deg)`,
            }}
          >
            {vote}
          </span>
        ) : null}
      </div>
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
