import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";

export function TitleScene({ subtitle }: { subtitle?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.6], [0, 1], {
    easing: EASE_EXPO,
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, fps * 0.6], [24, 0], {
    easing: EASE_EXPO,
    extrapolateRight: "clamp",
  });
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-6"
      style={{ opacity, transform: `translateY(${y}px)` }}
    >
      <h1 className="font-heading text-8xl font-bold text-nearwhite">
        __SLUG__
      </h1>
      {subtitle ? (
        <p className="font-mono text-2xl text-text-secondary">{subtitle}</p>
      ) : null}
    </div>
  );
}
