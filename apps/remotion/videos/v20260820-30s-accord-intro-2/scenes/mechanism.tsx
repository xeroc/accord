import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { Backdrop } from "../../../src/shell/backdrop";

const POOL_SIZE = 30;

const DRAWN = [
  { dot: 7, at: 40 },
  { dot: 16, at: 50 },
  { dot: 24, at: 60 },
];

const JURORS = [
  { hash: "6f3a91", commitAt: 90, vote: "yes", revealAt: 135 },
  { hash: "c07d24", commitAt: 98, vote: "yes", revealAt: 143 },
  { hash: "9b1e58", commitAt: 106, vote: "no", revealAt: 151 },
];

const STAGE_FRAMES = [40, 90, 135];
const CAPTIONS = ["DRAW", "COMMIT", "REVEAL", "RULE"];

/**
 * Scene 2 — the mechanism (5s-12s).
 * Left: the claim. Right: the pipeline — a staked pool, three jurors drawn,
 * commits land as hashes, reveals flip to votes, the ruling stamps in.
 */
export function MechanismScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stage = STAGE_FRAMES.filter((s) => frame >= s).length;

  return (
    <div className="relative h-full w-full">
      <Backdrop seed="mechanism" />
      <div className="relative flex h-full items-center gap-24 px-24">
        <div className="flex flex-1 flex-col justify-center gap-8">
          <Interactive.Div
            name="Mechanism headline"
            className="font-heading text-7xl font-bold leading-tight tracking-tight text-nearwhite"
            style={{
              opacity: interpolate(frame, [0.25 * fps, 0.75 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(
                frame,
                [0.25 * fps, 0.75 * fps],
                ["0px 24px", "0px 0px"],
                {
                  easing: EASE_EXPO,
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                },
              ),
            }}
          >
            Accord puts human jurors on-chain.
          </Interactive.Div>
          <Interactive.Div
            name="Mechanism subline"
            className="font-mono text-2xl text-text-secondary"
            style={{
              opacity: interpolate(frame, [1.8 * fps, 2.3 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            drawn at random / staked / slashed for dishonesty
          </Interactive.Div>
          <Interactive.Div
            name="Mechanism incentive line"
            className="font-heading text-3xl font-medium text-amber"
            style={{
              opacity: interpolate(frame, [3.1 * fps, 3.6 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Vote with the majority or lose your stake.
          </Interactive.Div>
        </div>

        <div className="flex w-[620px] flex-col items-center gap-7">
          {/* staked pool */}
          <Interactive.Div
            name="Juror pool"
            className="grid grid-cols-5 gap-4"
            style={{
              opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {Array.from({ length: POOL_SIZE }, (_, i) => {
              const draw = DRAWN.find((d) => d.dot === i);
              const pop = draw
                ? interpolate(frame, [draw.at, draw.at + 6], [0, 1], {
                    easing: EASE_EXPO,
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0;
              return (
                <div key={i} className="relative h-3 w-3">
                  <div className="absolute inset-0 rounded-full bg-border-subtle" />
                  <div
                    className="absolute inset-0 rounded-full bg-amber"
                    style={{ opacity: pop, scale: 0.4 + pop * 0.6 }}
                  />
                </div>
              );
            })}
          </Interactive.Div>

          <div className="h-8 w-px bg-border-subtle" />

          {/* commits, then reveals */}
          <div className="flex gap-4">
            {JURORS.map((juror) => (
              <Interactive.Div
                key={juror.hash}
                name={`Commit ${juror.hash}`}
                className="relative overflow-hidden rounded-md border border-border-subtle bg-raised px-5 py-2.5 font-mono text-lg"
                style={{
                  opacity: interpolate(
                    frame,
                    [juror.commitAt, juror.commitAt + 5],
                    [0, 1],
                    {
                      easing: EASE_EXPO,
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    },
                  ),
                }}
              >
                <span
                  className="text-body"
                  style={{
                    opacity: interpolate(
                      frame,
                      [juror.revealAt, juror.revealAt + 5],
                      [1, 0.25],
                      {
                        easing: EASE_EXPO,
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      },
                    ),
                  }}
                >
                  {juror.hash}
                </span>
                <span
                  className="absolute inset-0 flex items-center justify-center text-nearwhite"
                  style={{
                    opacity: interpolate(
                      frame,
                      [juror.revealAt, juror.revealAt + 5],
                      [0, 1],
                      {
                        easing: EASE_EXPO,
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      },
                    ),
                  }}
                >
                  {juror.vote}
                </span>
              </Interactive.Div>
            ))}
          </div>

          <div className="h-8 w-px bg-border-subtle" />

          {/* the ruling */}
          <Interactive.Div
            name="Ruling stamp"
            className="rounded-md border-2 border-amber px-10 py-4 font-mono text-4xl tracking-widest text-amber"
            style={{
              opacity: interpolate(frame, [175, 182], [0, 1], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [175, 182], [1.6, 1], {
                easing: EASE_EXPO,
                output: "perceptual-scale",
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              rotate: interpolate(frame, [175, 182], ["-4deg", "-2deg"], {
                easing: EASE_EXPO,
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            RULING: YES
          </Interactive.Div>

          <div className="flex gap-10 font-mono text-sm tracking-widest">
            {CAPTIONS.map((caption, i) => (
              <span
                key={caption}
                className={
                  stage === i ? "text-amber" : "text-muted-foreground"
                }
              >
                {caption}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
