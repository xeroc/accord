import { StateNode } from "@useaccord/ui";
import {
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S1 · HOOK — LISTED ignites but never hardens: amber, rippling, unresolved. */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = enterAt(frame, fps, 1.7, 0.4);
  const igniteAt = Math.round(2.0 * fps);

  return (
    <Scene seed="canon-item-hook" stack className="gap-10">
      <Interactive.Div
        name="Hook line one"
        className="font-heading text-7xl font-bold text-nearwhite"
        style={{
          opacity: enterAt(frame, fps, 0.1, 0.5),
          translate: `0px ${(1 - enterAt(frame, fps, 0.1, 0.5)) * 24}px`,
        }}
      >
        listed <span className="text-slash">doesn’t mean safe.</span>
      </Interactive.Div>
      <Interactive.Div
        name="Hook line two"
        className="font-heading text-8xl font-bold text-amber"
        style={{
          opacity: enterAt(frame, fps, 0.9, 0.55),
          scale: interpolate(
            frame,
            [0.9 * fps, 1.5 * fps],
            ["0.92 0.92", "1 1"],
            { easing: EASE_EXPO, output: "perceptual-scale", ...clamp },
          ),
        }}
      >
        it means tested.
      </Interactive.Div>

      {/* the LISTED badge: ignites, then keeps rippling — it never settles */}
      <Interactive.Div
        name="Listed badge"
        className="relative mt-4"
        style={{ opacity: enter, scale: "2.6 2.6" }}
      >
        {[0, 0.5].map((offset) => {
          const t = Math.max(0, frame - igniteAt);
          const p = (t / 57 + offset) % 1;
          return (
            <div
              key={offset}
              className="pointer-events-none absolute inset-0 rounded-full border border-amber"
              style={{ transform: `scale(${1 + p * 0.5})`, opacity: (1 - p) * 0.45 * enter }}
            />
          );
        })}
        <StateNode frame={frame} label="LISTED" activeAt={igniteAt} />
      </Interactive.Div>
    </Scene>
  );
}
