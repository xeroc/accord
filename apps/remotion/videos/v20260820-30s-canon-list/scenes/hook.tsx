import { Card, CardContent, CardHeader, CardTitle } from "@useaccord/ui";
import {
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

const MOLD_ROWS = ["stake_mint", "fee_mint", "submit_deposit", "listing_window"];

/**
 * S1 · HOOK — the strike. An amber rule slams, the ledger slab is born
 * empty beneath it, and the twist lands: permissionless is the feature.
 */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = enterAt(frame, fps, 0.4, 0.5);
  const slab = enterAt(frame, fps, 1.35, 0.5);

  return (
    <Scene seed="canon-list-hook" stack className="gap-12">
      <Interactive.Div
        name="Hook kicker"
        className="font-mono text-2xl tracking-widest text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0, 0.4) }}
      >
        nobody approves a list
      </Interactive.Div>

      <div className="flex flex-col items-center gap-9">
        <Interactive.Div
          name="Hook headline"
          className="font-heading text-7xl font-bold text-nearwhite"
          style={{ opacity: head, translate: `0px ${(1 - head) * 24}px` }}
        >
          anyone can forge a canon.
        </Interactive.Div>

        <Interactive.Div
          name="Hook strike rule"
          className="h-1.5 w-[520px] origin-center rounded-full bg-amber"
          style={{
            opacity: enterAt(frame, fps, 0.95, 0.1),
            scale: `${enterAt(frame, fps, 0.95, 0.12)} 1`,
          }}
        />

        <Interactive.Div
          name="Hook ledger slab"
          className="w-[520px]"
          style={{ opacity: slab, translate: `0px ${(1 - slab) * 30}px` }}
        >
          <Card size="sm">
            <CardHeader>
              <CardTitle className="font-mono text-lg text-text-secondary">
                canon list
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 font-mono text-xl">
              {MOLD_ROWS.map((k) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-text-secondary">{k}</span>
                  <span className="text-muted-foreground">——</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Hook punchline"
        className="font-heading text-6xl font-bold text-amber"
        style={{
          opacity: enterAt(frame, fps, 2.2, 0.5),
          scale: interpolate(
            frame,
            [2.2 * fps, 2.75 * fps],
            ["0.94 0.94", "1 1"],
            {
              easing: EASE_EXPO,
              output: "perceptual-scale",
              ...clamp,
            },
          ),
        }}
      >
        that’s the point.
      </Interactive.Div>
    </Scene>
  );
}
