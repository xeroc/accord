import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Backdrop — the shared moving background for video scenes.
 *
 * Four deterministic layers, all driven by useCurrentFrame (no wall clock,
 * no CSS animations):
 *
 *   1. ledger grid  — hairline grid drifting diagonally, terminal feel
 *   2. juror field  — seeded dots on slow lissajous drifts; a few pulse
 *                     Verdict Amber, like jurors being drawn
 *   3. verdict glow — one large amber radial glow orbiting slowly
 *   4. vignette     — ink edges so content reads on top
 *
 * `seed` varies the node field per scene so hard cuts feel fresh.
 */
export function Backdrop({ seed }: { seed: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const nodes = Array.from({ length: 26 }, (_, i) => {
    const r = (n: string) => random(`${seed}:${i}:${n}`);
    return {
      x: 3 + r("x") * 94,
      y: 4 + r("y") * 92,
      ampX: 12 + r("ax") * 26,
      ampY: 8 + r("ay") * 18,
      phase: r("p") * Math.PI * 2,
      speed: 0.4 + r("s") * 0.8,
      pulse: 0.35 + r("pu") * 0.65,
      stem: 28 + (i % 3) * 14,
    };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1 — ledger grid */}
      <div
        className="absolute"
        style={{
          left: -200,
          top: -140,
          width: 2320,
          height: 1360,
          backgroundImage: [
            "repeating-linear-gradient(to right, color-mix(in srgb, var(--accord-border) 55%, transparent) 0 1px, transparent 1px 96px)",
            "repeating-linear-gradient(to bottom, color-mix(in srgb, var(--accord-border) 55%, transparent) 0 1px, transparent 1px 96px)",
          ].join(", "),
          translate: interpolate(
            frame,
            [0, durationInFrames],
            ["0px 0px", "-96px -64px"],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      />

      {/* 2 — juror field */}
      {nodes.map((n, i) => {
        const px = n.x + Math.sin(frame * 0.01 * n.speed + n.phase) * n.ampX;
        const py =
          n.y + Math.cos(frame * 0.008 * n.speed + n.phase * 1.7) * n.ampY;
        const glow = Math.pow(
          Math.max(0, Math.sin(frame * 0.012 + n.phase * 3.1)),
          14,
        );
        return (
          <div key={i}>
            <div
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
                scale: 1 + glow * 1.6,
              }}
            />
          </div>
        );
      })}

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
}
