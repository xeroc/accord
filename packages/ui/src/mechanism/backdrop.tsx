import type { FC } from "react";

import { cn } from "../internal/cn";
import { seededRandom } from "../internal/prng";

/**
 * Backdrop — the shared ambient canvas behind Accord surfaces: hero
 * sections and video scenes. Four deterministic layers, all pure
 * functions of a `frame` counter (no wall clock, no CSS animations):
 *
 *   1. ledger grid  — hairline grid drifting diagonally, terminal feel
 *   2. juror field  — seeded dots on slow lissajous drifts; a few pulse
 *                     Verdict Amber, like jurors waiting to be drawn
 *   3. verdict glow — one large amber radial glow orbiting slowly
 *   4. vignette     — ink edges so content reads on top
 *
 * `seed` varies the node field per scene; `frame` comes from the
 * consumer — Remotion passes useCurrentFrame(), browsers use
 * useWallClockFrame(). The PRNG is a verbatim port of Remotion's
 * random(), so node fields match the original video backdrop exactly.
 */
export const Backdrop: FC<{
  frame: number;
  seed?: string;
  className?: string;
  "aria-hidden"?: boolean;
}> = ({ frame, seed = "accord", className, "aria-hidden": ariaHidden }) => {
  const nodes = Array.from({ length: 26 }, (_, i) => {
    const r = (n: string) => seededRandom(`${seed}:${i}:${n}`);
    return {
      x: 3 + r("x") * 94,
      y: 4 + r("y") * 92,
      ampX: 12 + r("ax") * 26,
      ampY: 8 + r("ay") * 18,
      phase: r("p") * Math.PI * 2,
      speed: 0.4 + r("s") * 0.8,
      stem: 28 + (i % 3) * 14,
    };
  });

  // Grid drift: 96px per 900 frames on both axes — the pattern is
  // 96px-periodic, so the modulo cycle is seamless and infinite.
  const drift = (px96 = 96) => -(((frame * px96) / 900) % 96);

  return (
    <div
      aria-hidden={ariaHidden}
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* 1 — ledger grid */}
      <div
        className="absolute"
        style={{
          backgroundImage: [
            "repeating-linear-gradient(to right, color-mix(in srgb, var(--accord-border) 55%, transparent) 0 1px, transparent 1px 96px)",
            "repeating-linear-gradient(to bottom, color-mix(in srgb, var(--accord-border) 55%, transparent) 0 1px, transparent 1px 96px)",
          ].join(", "),
          translate: `${drift()}px ${drift()}px`,
        }}
      />

      {/* 2 — juror field */}
      <div>
        {nodes.map((n, i) => {
          const px = n.x + Math.sin(frame * 0.01 * n.speed + n.phase) * n.ampX;
          const py =
            n.y + Math.cos(frame * 0.008 * n.speed + n.phase * 1.7) * n.ampY;
          const glow = Math.pow(
            Math.max(0, Math.sin(frame * 0.012 + n.phase * 3.1)),
            14,
          );
          return (
            <div key={i} data-node>
              <div
                data-stem
                className="absolute w-px"
                style={{
                  left: `${px}%`,
                  top: `${py}%`,
                  height: n.stem,
                  backgroundColor:
                    "color-mix(in srgb, var(--accord-border) 80%, transparent)",
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  left: `${px}%`,
                  top: `${py}%`,
                  width: 3,
                  height: 3,
                  marginLeft: -1.5,
                  marginTop: -1.5,
                  backgroundColor:
                    glow > 0.02
                      ? "var(--accord-amber)"
                      : "color-mix(in srgb, var(--accord-text-secondary) 35%, transparent)",
                  opacity: 0.45 + glow * 0.55,
                  scale: String(1 + glow * 1.6),
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 3 — verdict glow */}
      <div
        className="absolute"
        style={{
          width: 1500,
          height: 1500,
          left: 210,
          top: -210,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--accord-amber) 16%, transparent) 0%, transparent 60%)",
          translate: `${Math.sin(frame * 0.004) * 260}px ${Math.cos(frame * 0.0032) * 140}px`,
          opacity: 0.5,
        }}
      />

      {/* 4 — vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, color-mix(in srgb, var(--accord-ink) 80%, transparent) 100%)",
        }}
      />
    </div>
  );
};
