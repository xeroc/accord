import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  MonoChip,
} from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt, exitAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/** Frame the api key bounces off the wall. */
const REJECT = 1.9;

/** S3 · ANTAGONIST — today's answer: somebody's private list, keyed. */
export function AntagonistScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rejected = frame >= REJECT * fps;
  const slide = enterAt(frame, fps, REJECT + 0.15, 0.5);

  return (
    <Scene seed="canon-intro-antagonist" stack className="gap-12">
      <Interactive.Div
        name="Private list card"
        className="w-[560px]"
        style={{ opacity: enterAt(frame, fps, 0, 0.6) }}
      >
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="font-mono text-xl text-text-secondary">
              private list
            </CardTitle>
            <Badge variant="secondary">authorized only</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 font-mono text-2xl">
            <div className="flex justify-between">
              <span className="text-text-secondary">curated by</span>
              <span className="text-nearwhite">one operator</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">access</span>
              <span className="text-nearwhite">api key</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">list</span>
              <span className="text-slash">closed</span>
            </div>
          </CardContent>
        </Card>
      </Interactive.Div>

      <div className="flex h-[64px] items-center gap-6">
        <Interactive.Div
          name="Api key chip"
          style={{
            opacity: enterAt(frame, fps, 0.7, 0.4) * (1 - slide),
            translate: `${slide * 150}px ${slide * -26}px`,
            rotate: `${slide * 9}deg`,
          }}
        >
          <MonoChip
            tone={rejected ? "slash" : "neutral"}
            className="px-6 py-2.5 text-2xl"
          >
            api_key · 8fJ2…kLm9
          </MonoChip>
        </Interactive.Div>
        <Interactive.Div
          name="Denied chip"
          style={{ opacity: enterAt(frame, fps, REJECT + 0.35, 0.4) }}
        >
          <MonoChip tone="slash" className="px-6 py-2.5 text-2xl">
            401 · denied
          </MonoChip>
        </Interactive.Div>
      </div>

      <div className="flex h-[80px] flex-col items-center justify-start">
        <Interactive.Div
          name="Antagonist line one"
          className="font-heading text-6xl font-bold text-nearwhite"
          style={{
            opacity: Math.min(
              enterAt(frame, fps, 0.2, 0.45),
              exitAt(frame, fps, 1.6, 0.3),
            ),
          }}
        >
          today: somebody&rsquo;s private list.
        </Interactive.Div>
        <Interactive.Div
          name="Antagonist line two"
          className="font-heading text-6xl font-bold text-nearwhite"
          style={{
            opacity: enterAt(frame, fps, 1.75, 0.45),
            translate: `0px ${(1 - enterAt(frame, fps, 1.75, 0.45)) * 24}px`,
          }}
        >
          a gate. an api key.
        </Interactive.Div>
      </div>
    </Scene>
  );
}
