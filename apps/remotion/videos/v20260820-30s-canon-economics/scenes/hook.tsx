import { Card, CardContent, CardHeader, CardTitle } from "@useaccord/ui";
import {
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { EASE_EXPO, SPRING } from "../../../src/shell/presets";
import { clamp, enterAt, since } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * S1 · HOOK — a plated card shrugs off a strike… until an honest one
 * pins it. Kicker: lying has a price tag.
 */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // strike 1 (slash): springs in f18, impacts f32, deflects away empty
  const t1 = spring({ frame: since(frame, 18), fps, config: SPRING.snappy });
  const s1x =
    190 * (1 - t1) +
    interpolate(frame, [32, 52], [0, -170], { easing: EASE_EXPO, ...clamp });
  const s1y =
    -140 * (1 - t1) +
    interpolate(frame, [32, 52], [0, -120], { easing: EASE_EXPO, ...clamp });
  const s1op = interpolate(frame, [32, 50], [1, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const bump1 = interpolate(frame, [32, 35, 42], [1, 1.035, 1], {
    easing: [EASE_EXPO, EASE_EXPO],
    ...clamp,
  });
  const ring1Op = interpolate(frame, [32, 41], [0.9, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const ring1Scale = interpolate(frame, [32, 41], [1, 1.25], {
    easing: EASE_EXPO,
    ...clamp,
  });

  // strike 2 (confirm): springs in f66, impacts f80, lodges — pinned
  const t2 = spring({ frame: since(frame, 66), fps, config: SPRING.snappy });
  const lodge = interpolate(frame, [80, 90], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const s2x = 200 * (1 - t2) + 6 * lodge;
  const s2y = -150 * (1 - t2) + 4 * lodge;
  const ring2Op = interpolate(frame, [80, 89], [0.9, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const ring2Scale = interpolate(frame, [80, 89], [1, 1.25], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const pinTilt = interpolate(frame, [80, 92], [0, -2.5], {
    easing: EASE_EXPO,
    ...clamp,
  });

  const cardIn = enterAt(frame, fps, 0.15, 0.5);

  return (
    <Scene seed="canon-econ-hook" stack className="gap-9">
      <Interactive.Div
        name="Hook kicker"
        className="font-mono text-2xl tracking-[0.3em] text-text-secondary"
        style={{ opacity: enterAt(frame, fps, 0.05, 0.4) }}
      >
        lying has a price tag
      </Interactive.Div>

      <div className="relative h-[168px] w-[320px]">
        <Interactive.Div
          name="Hook target card"
          className="absolute left-[10px] top-[24px] w-[300px]"
          style={{
            opacity: cardIn,
            rotate: `${pinTilt}deg`,
            scale: `${bump1} ${bump1}`,
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-lg text-text-secondary">
                $WIF · 7xKX…gQ2v
              </CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2 pb-4">
              <div className="absolute -left-2 top-6 h-20 w-2 rounded-full bg-amber" />
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="h-7 flex-1 rounded-md border border-amber bg-amber"
                  style={{ opacity: enterAt(frame, fps, 0.3 + i * 0.1, 0.3) }}
                />
              ))}
            </CardContent>
          </Card>
        </Interactive.Div>

        {/* strike 1 — deflects off the plate */}
        <Interactive.Div
          name="Hook strike deflect"
          className="absolute left-[218px] top-[24px] h-1.5 w-32 origin-center rounded-full bg-slash"
          style={{ rotate: "-36deg", translate: `${s1x}px ${s1y}px`, opacity: s1op }}
        />
        <Interactive.Div
          name="Hook deflect ring"
          className="absolute left-[236px] top-[-2px] h-16 w-16 rounded-full border-2 border-amber"
          style={{ opacity: ring1Op, scale: `${ring1Scale} ${ring1Scale}` }}
        />

        {/* strike 2 — pins the card */}
        <Interactive.Div
          name="Hook strike pin"
          className="absolute left-[222px] top-[38px] h-1.5 w-32 origin-center rounded-full bg-confirm"
          style={{ rotate: "-36deg", translate: `${s2x}px ${s2y}px` }}
        />
        <Interactive.Div
          name="Hook pin ring"
          className="absolute left-[240px] top-[12px] h-16 w-16 rounded-full border-2 border-confirm"
          style={{ opacity: ring2Op, scale: `${ring2Scale} ${ring2Scale}` }}
        />
      </div>

      <div className="flex flex-col items-center gap-5">
        <Interactive.Div
          name="Hook line 1"
          className="font-heading text-6xl font-bold text-nearwhite"
          style={{ opacity: enterAt(frame, fps, 0.25, 0.5) }}
        >
          attacks make the target stronger.
        </Interactive.Div>
        <Interactive.Div
          name="Hook line 2"
          className="font-heading text-6xl font-bold text-amber"
          style={{ opacity: enterAt(frame, fps, 1.8, 0.5) }}
        >
          until one doesn’t.
        </Interactive.Div>
      </div>
    </Scene>
  );
}
