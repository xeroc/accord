import { Card, CardContent, CardHeader, CardTitle, StateNode } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** S1 · HOOK — a fake sits in the list; the answer is capital, not reports. */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <Scene seed="canon-challenge-hook" stack className="gap-10">
      <Interactive.Div
        name="Fake token card"
        className="w-[420px]"
        style={{
          opacity: enterAt(frame, fps, 0, 0.5),
          translate: `0px ${(1 - enterAt(frame, fps, 0, 0.5)) * 24}px`,
        }}
      >
        <Card className="ring-slash">
          <CardHeader>
            <CardTitle className="flex items-center justify-between font-mono text-xl">
              <span className="text-text-secondary">$WlF · fake</span>
              <StateNode
                frame={frame}
                label="LISTED"
                at={15}
                activeAt={27}
                settleAt={48}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl text-nearwhite">
              “rugproof. trust us.”
            </p>
          </CardContent>
        </Card>
      </Interactive.Div>

      <div className="flex flex-col items-center gap-6">
        <Interactive.Div
          name="Hook line 1"
          className="font-heading font-bold text-7xl text-nearwhite"
          style={{ opacity: enterAt(frame, fps, 0.7, 0.4) }}
        >
          see a <span className="text-slash">scam?</span>
        </Interactive.Div>
        <Interactive.Div
          name="Hook line 2"
          className="font-heading font-bold text-7xl text-nearwhite"
          style={{ opacity: enterAt(frame, fps, 1.6, 0.4) }}
        >
          put <span className="text-amber">capital</span> behind it.
        </Interactive.Div>
        <Interactive.Div
          name="Challenger chips"
          className="mt-2 flex flex-col items-center gap-2"
        >
          {[0, 1, 2].map((i) => {
            const e = enterAt(frame, fps, 2.3 + i * 0.25, 0.35);
            return (
              <div
                key={i}
                className="h-7 w-40 rounded-md border border-amber bg-amber"
                style={{ opacity: e, translate: `0px ${(1 - e) * 16}px` }}
              />
            );
          })}
        </Interactive.Div>
      </div>
    </Scene>
  );
}
