import { Card, CardContent, CardHeader, CardTitle } from "@useaccord/ui";
import { Interactive, useCurrentFrame, useVideoConfig } from "remotion";

import { enterAt, exitAt } from "../../../src/shell/anim";
import { Scene } from "../../../src/shell/scene";

/**
 * Fake clones ripple out around the real card — offset from center,
 * tilt, near-miss id, scam line. Static table = deterministic.
 */
const FAKES = [
  { dx: -540, dy: -250, rot: -6, id: "$W1F · 7xKX…gQ2r", line: "the real wif. trust." },
  { dx: 560, dy: -265, rot: 5, id: "$wlf · 7xKX…qQ2v", line: "wif 2.0. 100x." },
  { dx: -160, dy: -375, rot: 3, id: "$VVIF · 7kKX…gQ2v", line: "official airdrop." },
  { dx: 185, dy: -385, rot: -4, id: "$WIF · 7xKX…gO2v", line: "same coin. cheaper." },
  { dx: -630, dy: -70, rot: 4, id: "$WlF · 7xXK…gQ2v", line: "wif but better." },
  { dx: 650, dy: -90, rot: -5, id: "$wif · x7KX…gQ2v", line: "community takeover." },
  { dx: -525, dy: 300, rot: -3, id: "$W1F · 7xKX…gQ2w", line: "presale open." },
  { dx: 545, dy: 315, rot: 4, id: "$WlF · 7kKX…gO2v", line: "the original wif." },
] as const;

/** S1 · HOOK — one real token; the clones arrive in minutes. */
export function HookScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const real = enterAt(frame, fps, 0, 0.6);

  return (
    <Scene seed="canon-intro-hook">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-14">
        <Interactive.Div
          name="Real token card"
          className="w-[460px]"
          style={{
            opacity: real,
            translate: `0px ${(1 - real) * 30}px`,
          }}
        >
          <Card className="ring-2 ring-amber">
            <CardHeader>
              <CardTitle className="font-mono text-xl text-text-secondary">
                $WIF · 7xKX…gQ2v
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-2xl text-nearwhite">the original.</p>
            </CardContent>
          </Card>
        </Interactive.Div>

        <div className="flex h-[96px] flex-col items-center justify-start">
          <Interactive.Div
            name="Hook line one"
            className="font-heading text-7xl font-bold text-nearwhite"
            style={{
              opacity: Math.min(
                enterAt(frame, fps, 0.5, 0.45),
                exitAt(frame, fps, 1.75, 0.3),
              ),
            }}
          >
            a token launches.
          </Interactive.Div>
          <Interactive.Div
            name="Hook line two"
            className="font-heading text-7xl font-bold text-nearwhite"
            style={{
              opacity: enterAt(frame, fps, 1.95, 0.5),
              translate: `0px ${(1 - enterAt(frame, fps, 1.95, 0.5)) * 24}px`,
            }}
          >
            the <span className="text-slash">fakes</span> arrive in minutes.
          </Interactive.Div>
        </div>
      </div>

      {FAKES.map((fake, i) => {
        // 3-frame stagger, 8-frame pop: ~2–3 of 8 moving at once (≤ 1/3).
        const pop = enterAt(frame, fps, 2.1 + i * 0.1, 8 / 30);
        return (
          <Interactive.Div
            key={i}
            name={`Fake token ${i + 1}`}
            className="absolute w-[380px]"
            style={{
              left: 960 + fake.dx - 190,
              top: 540 + fake.dy - 62,
              opacity: pop,
              rotate: `${fake.rot}deg`,
              scale: 0.9,
              translate: `${fake.dx * 0.7 * (pop - 1)}px ${fake.dy * 0.7 * (pop - 1)}px`,
            }}
          >
            <Card className="bg-raised ring-border-subtle">
              <CardHeader>
                <CardTitle className="font-mono text-lg text-muted-foreground">
                  {fake.id}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-xl text-muted-foreground">{fake.line}</p>
              </CardContent>
            </Card>
          </Interactive.Div>
        );
      })}
    </Scene>
  );
}
