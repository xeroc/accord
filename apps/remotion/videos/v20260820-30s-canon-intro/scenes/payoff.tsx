import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  MonoChip,
} from "@useaccord/ui";
import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO } from "../../../src/shell/presets";
import { clamp, enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

const ITEM_ID = "$WIF · 7xKX…gQ2v";

/**
 * S5 · PAYOFF — open access, then the integrator moment.
 * Stage one is fully gone (faded AND lifted out) before the wallet
 * and the list card enter — the two layers never coexist on screen.
 */
export function PayoffScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = enterAt(frame, fps, 2.8, 0.5);

  return (
    <Scene seed="canon-intro-payoff" stack>
      <div className="flex flex-col items-center gap-8">
        <Interactive.Div
          name="Payoff headline"
          className="font-heading text-7xl font-bold text-nearwhite"
          style={{
            opacity: interpolate(
              frame,
              [0.1 * fps, 0.6 * fps, 2.3 * fps, 2.7 * fps],
              [0, 1, 1, 0],
              { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
            ),
            translate: interpolate(
              frame,
              [2.3 * fps, 2.7 * fps],
              ["0px 0px", "0px -60px"],
              { easing: EASE_EXPO, ...clamp },
            ),
          }}
        >
          no <span className="text-slash">key.</span> no{" "}
          <span className="text-slash">gate.</span>
        </Interactive.Div>
        <Interactive.Div
          name="Payoff account line"
          className="font-heading text-5xl font-bold text-nearwhite"
          style={{
            opacity: interpolate(
              frame,
              [0.8 * fps, 1.3 * fps, 2.3 * fps, 2.7 * fps],
              [0, 1, 1, 0],
              { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
            ),
            translate: interpolate(
              frame,
              [2.3 * fps, 2.7 * fps],
              ["0px 0px", "0px -60px"],
              { easing: EASE_EXPO, ...clamp },
            ),
          }}
        >
          one account <span className="text-amber">your program</span> can
          read.
        </Interactive.Div>
        <Interactive.Div
          name="Payoff sdk chip"
          style={{
            opacity: interpolate(
              frame,
              [1.1 * fps, 1.5 * fps, 2.3 * fps, 2.7 * fps],
              [0, 1, 1, 0],
              { easing: [EASE_EXPO, Easing.linear, EASE_EXPO], ...clamp },
            ),
          }}
        >
          <MonoChip tone="neutral" className="px-6 py-2.5 text-2xl">
            @useaccord/canon
          </MonoChip>
        </Interactive.Div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center gap-10">
        <Interactive.Div
          name="Canon list read"
          className="w-[520px]"
          style={{ opacity: rise, translate: `0px ${(1 - rise) * 30}px` }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                canon list
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 font-mono text-2xl">
              <div className="flex items-center justify-between gap-6">
                <span className="text-nearwhite">{ITEM_ID}</span>
                <Badge
                  variant="outline"
                  className="border-confirm/50 bg-confirm/10 px-4 py-1 text-xl text-confirm"
                  style={{ opacity: enterAt(frame, fps, 3.9, 0.4) }}
                >
                  LISTED ✓
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="text-muted-foreground">$MEL · 3aQm…t5Ln</span>
                <span className="text-text-secondary">listed</span>
              </div>
            </CardContent>
          </Card>
        </Interactive.Div>

        <Interactive.Div
          name="Read line"
          className="h-[3px] w-[180px] origin-left rounded-full bg-amber"
          style={{
            opacity: enterAt(frame, fps, 2.9, 0.3),
            scale: `${enterAt(frame, fps, 3.2, 0.5)} 1`,
          }}
        />

        <Interactive.Div
          name="Wallet mock"
          className="w-[420px]"
          style={{ opacity: rise, translate: `0px ${(1 - rise) * 30}px` }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 font-mono text-2xl">
              <div className="flex justify-between">
                <span className="text-text-secondary">$WIF</span>
                <span className="text-nearwhite">1,000</span>
              </div>
              <Interactive.Div
                name="Wallet source row"
                className="flex justify-between"
                style={{ opacity: enterAt(frame, fps, 4.2, 0.4) }}
              >
                <span className="text-text-secondary">source</span>
                <span className="text-confirm">canon ✓</span>
              </Interactive.Div>
            </CardContent>
          </Card>
        </Interactive.Div>
      </div>
    </Scene>
  );
}
