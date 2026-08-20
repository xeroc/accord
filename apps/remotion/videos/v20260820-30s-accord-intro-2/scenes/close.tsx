import { Interactive, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt, exitAt } from "../../../src/shell/anim";
import { AmberRule, Wordmark } from "@useaccord/ui";
import { Scene } from "../../../src/shell/scene";

/**
 * Scene 5 — close (27s-30s).
 * Wordmark, amber rule, the thesis line, the program id. Fades to ink.
 */
export function CloseScene() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <Scene seed="close">
      <Interactive.Div
        name="Close stack"
        className="relative flex h-full flex-col items-center justify-center gap-9"
        style={{ opacity: exitAt(frame, fps, (durationInFrames - 15) / fps, 0.5) }}
      >
        <Interactive.Div name="Wordmark">
          <Wordmark
            enter={enterAt(frame, fps, 0, 0.4)}
            settle={30}
            className="text-[10rem] leading-none"
          />
        </Interactive.Div>

        <Interactive.Div name="Amber rule">
          <AmberRule
            enter={enterAt(frame, fps, 0.25, 0.45)}
            className="h-1.5 w-56"
          />
        </Interactive.Div>

        <Interactive.Div
          name="Thesis line"
          className="font-heading text-4xl font-medium text-body"
          style={{ opacity: enterAt(frame, fps, 0.4, 0.4) }}
        >
          Honesty is now a Solana primitive.
        </Interactive.Div>

        <Interactive.Div
          name="Program id"
          className="font-mono text-base text-text-secondary"
          style={{ opacity: enterAt(frame, fps, 0.6, 0.4) }}
        >
          cordhVoshqRV6kzGBmM89A66wuusJGsDCvLMHPLyKed
        </Interactive.Div>
      </Interactive.Div>
    </Scene>
  );
}
