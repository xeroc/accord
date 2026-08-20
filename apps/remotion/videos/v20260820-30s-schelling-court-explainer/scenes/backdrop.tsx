import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * Backdrop — ambient layer, adapted from videos/accord-30s/scenes/backdrop
 * (calmer: fewer nodes, slower drift — this video carries dense foreground
 * choreography). Deterministic, driven purely by useCurrentFrame:
 *
 *   1. ledger grid  — hairline grid drifting diagonally, terminal feel
 *   2. juror field  — seeded dots on slow lissajous drifts; a few pulse
 *                     Verdict Amber, like jurors waiting to be drawn
 *   3. verdict glow — one large amber radial glow orbiting slowly
 *   4. vignette     — ink edges so content reads on top
 */
export function Backdrop({ seed }: { seed: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const nodes = Array.from({ length: 18 }, (_, i) => {
    const r = (n: string) => random(`${seed}:${i}:${n}`);
    return {
      x: 3 + r("x") * 94,
      y: 4 + r("y") * 92,
      ampX: 10 + r("ax") * 20,
      ampY: 6 + r("ay") * 14,
      phase: r("p") * Math.PI * 2,
      speed: 0.25 + r("s") * 0.5,
      pulse: 0.35 + r("pu") * 0.65,
      stem: 28 + (i % 3) * 14,
    };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 1 — ledger grid */}
      <div
        className="absolute -inset-24 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-nearwhite) 1px, transparent 1px), linear-gradient(to bottom, var(--color-nearwhite) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          transform: `translate(${(frame % 72) - 72}px, ${((frame * 0.5) % 72) - 72}px)`,
        }}
      />

      {/* 2 — juror field */}
      {nodes.map((n, i) => {
        const t = (frame / durationInFrames) * Math.PI * 2 * n.speed + n.phase;
        const left = `${n.x + Math.cos(t) * n.ampX * 0.3}%`;
        const top = `${n.y + Math.sin(t * 1.3) * n.ampY * 0.3}%`;
        const pulse =
          0.5 +
          0.5 *
            Math.sin(
              (frame / durationInFrames) * Math.PI * 6 * n.pulse + n.phase * 3,
            );
        return (
          <div
            key={i}
            className="absolute h-1 w-1 rounded-full"
            style={{
              left,
              top,
              backgroundColor: "var(--color-nearwhite)",
              opacity: 0.06 + pulse * 0.08,
            }}
          />
        );
      })}

      {/* 3 — verdict glow */}
      <div
        className="absolute h-[900px] w-[900px] rounded-full"
        style={{
          left: `${28 + Math.sin((frame / durationInFrames) * Math.PI * 2) * 10}%`,
          top: `${-18 + Math.cos((frame / durationInFrames) * Math.PI * 2) * 6}%`,
          background:
            "radial-gradient(circle, var(--color-amber) 0%, transparent 60%)",
          opacity: 0.05,
        }}
      />

      {/* 4 — vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, var(--color-background) 100%)",
        }}
      />
    </div>
  );
}
