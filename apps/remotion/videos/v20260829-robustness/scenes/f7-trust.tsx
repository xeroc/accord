import { useCurrentFrame } from "remotion";

import { MonoChip, SubaccordCard } from "@useaccord/ui";
import { ConceptScene, breath, draw, lin, pop, rise, tw } from "./chrome";

/**
 * F7 — the trust profile map (the capstone).
 *
 * The protocol points at its own trust boundaries. Green: verified
 * on-chain, no trust required. Amber: trusted, but attributed and
 * mitigated — several tags link straight back to F2, F4, and F6. Red:
 * exactly one deep assumption, stated plainly, priced into the
 * economics, and contained. Candor as a feature diagram.
 */

const GREEN_NODES = ["accumulator root", "sortition verification", "fee accounting"] as const;

const AMBER_NODES = [
  { title: "vrf provider", tag: "liveness → timeout-gated exit", tone: "confirm" as const },
  { title: "evidence operator", tag: "plaintext access · attributed", tone: "neutral" as const },
  { title: "credential authority", tag: "judgment · attestations expire", tone: "neutral" as const },
  { title: "upgrade authority", tag: "timelocked · pre-freeze", tone: "amber" as const },
];

const GREEN_FOCUS: [number, number] = [36, 102];
const AMBER_FOCUS: [number, number] = [105, 171];
const RED_FOCUS: [number, number] = [174, 246];

function ZoneFrame({
  frame,
  rect,
  cls,
  at,
}: {
  frame: number;
  rect: { x: number; y: number; w: number; h: number; r: number };
  cls: string;
  at: number;
}) {
  const { x, y, w, h, r } = rect;
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 640" fill="none">
      <rect
        x={x} y={y} width={w} height={h} rx={r}
        className={cls} stroke="currentColor" strokeWidth={1.5}
        pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, at, 15)}
      />
    </svg>
  );
}

function Check({ frame, at }: { frame: number; at: number }) {
  return (
    <svg width={22} height={18} viewBox="0 0 22 18" className="text-confirm" fill="none">
      <polyline
        points="3,9 8,14 19,3" stroke="currentColor" strokeWidth={2.5}
        strokeLinecap="square" pathLength={1} strokeDasharray={1} strokeDashoffset={draw(frame, at, 8)}
      />
    </svg>
  );
}

export function F7TrustScene() {
  const frame = useCurrentFrame();
  const inFocus = (w: [number, number]) => frame >= w[0] && frame <= w[1];
  const zoneLum = (focus: [number, number], period: number, phase: number) => {
    const settleRise = tw(frame, 249, 264, 0.8, 1);
    const dim = inFocus(focus) ? 1 : settleRise;
    return dim * (0.94 + 0.06 * breath(frame, period, phase));
  };
  const greenLum = zoneLum(GREEN_FOCUS, 120, 0);
  const amberLum = zoneLum(AMBER_FOCUS, 150, 2.1);
  const redLum = zoneLum(RED_FOCUS, 105, 4.2);

  const scanX = 40 + lin(frame, 39, 66, 0, 380);
  const amberPulse = Math.sin(Math.PI * lin(frame, 150, 165, 0, 1));
  const ringPulse = Math.sin(Math.PI * lin(frame, 225, 240, 0, 1));
  const stakeFill = tw(frame, 180, 198, 0, 0.53);
  const legendBreath = (i: number) => 1 + 0.04 * Math.sin(Math.PI * lin(frame, 264 + i * 4, 280 + i * 4, 0, 1));
  return (
    <ConceptScene
      seed="robustness-f7"
      kicker="TRUST PROFILE MAP"
      title="what is trusted, exactly"
      caption="verified on-chain · trusted-but-attributed · one stated, priced, contained assumption"
    >
      <div className="relative" style={{ width: 1440, height: 640 }}>
        {/* territory boundaries, stroke-drawn */}
        <ZoneFrame frame={frame} rect={{ x: 30, y: 30, w: 430, h: 530, r: 24 }} cls="text-confirm/40" at={2} />
        <ZoneFrame frame={frame} rect={{ x: 500, y: 30, w: 500, h: 300, r: 24 }} cls="text-amber/40" at={6} />
        <ZoneFrame frame={frame} rect={{ x: 1040, y: 160, w: 370, h: 400, r: 24 }} cls="text-slash/40" at={10} />

        {/* GREEN — trustless by construction */}
        <div className="absolute" style={{ left: 30, top: 30, width: 430, height: 530, opacity: greenLum }}>
          <div className="absolute inset-0 rounded-3xl bg-confirm/5" style={{ opacity: tw(frame, 18, 30, 0, 1) }} />
          <div className="absolute left-7 top-4 font-mono text-sm text-confirm" style={rise(frame, 14, 9)}>
            trustless by construction
          </div>
          {GREEN_NODES.map((n, i) => (
            <div key={n} className="absolute" style={{ left: 62, top: 96 + i * 150 }}>
              <div className="flex items-center gap-3">
                <SubaccordCard frame={frame} title={n} at={8 + i * 4} className="w-64" />
                <div style={{ opacity: tw(frame, 44, 50, 0, 1) }}>
                  <Check frame={frame} at={48 + i * 4} />
                </div>
              </div>
            </div>
          ))}
          {/* the verification scan */}
          {frame >= 39 && frame <= 68 ? (
            <div
              className="absolute top-2 h-[506px] w-16 rounded-sm border-x border-confirm/30 bg-confirm/10"
              style={{ left: scanX, opacity: 0.9 }}
            />
          ) : null}
        </div>

        {/* AMBER — trusted, attributed & mitigated */}
        <div className="absolute" style={{ left: 500, top: 30, width: 500, height: 300, opacity: amberLum }}>
          <div
            className="absolute inset-0 rounded-3xl bg-amber/5"
            style={{ opacity: tw(frame, 22, 34, 0, 1), boxShadow: `0 0 ${28 * amberPulse}px var(--accord-amber)` }}
          />
          <div className="absolute left-7 top-4 font-mono text-sm text-amber" style={rise(frame, 17, 9)}>
            trusted — attributed &amp; mitigated
          </div>
          {AMBER_NODES.map((n, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const bright = 0.75 + 0.25 * tw(frame, 108 + i * 5, 116 + i * 5, 0, 1);
            return (
              <div
                key={n.title}
                className="absolute"
                style={{ left: 28 + col * 246, top: 58 + row * 118, opacity: bright }}
              >
                <SubaccordCard frame={frame} title={n.title} at={10 + i * 3} className="w-56">
                  <div style={{ opacity: tw(frame, 120 + i * 6, 128 + i * 6, 0, 1) }}>
                    <div style={{ perspective: 200 }}>
                      <div
                        style={{
                          transform: `rotateX(${(1 - tw(frame, 120 + i * 6, 128 + i * 6, 0, 1)) * 80}deg)`,
                        }}
                      >
                        <MonoChip tone={n.tone} className="text-[10px]">{n.tag}</MonoChip>
                      </div>
                    </div>
                  </div>
                </SubaccordCard>
              </div>
            );
          })}
        </div>

        {/* RED — the honest-majority assumption, contained */}
        <div className="absolute" style={{ left: 1040, top: 160, width: 370, height: 400, opacity: redLum }}>
          <div className="absolute inset-0 rounded-3xl bg-slash/5" style={{ opacity: tw(frame, 26, 38, 0, 1) }} />
          {/* containment ring */}
          <div
            className="absolute inset-3 rounded-[20px] border-2 border-slash/40"
            style={{ boxShadow: `0 0 ${30 * ringPulse}px var(--accord-slash)` }}
          />
          <div className="absolute left-7 top-5 font-mono text-sm text-slash" style={rise(frame, 20, 9)}>
            honest-majority assumption
          </div>

          {/* the stake-weight bar, filled just past 51% */}
          <div className="absolute" style={{ left: 42, top: 96 }}>
            <div className="relative h-5 w-[290px] overflow-hidden rounded-full border border-slash/40 bg-ink">
              <div
                className="h-full rounded-full bg-slash/50"
                style={{ width: `${stakeFill * 100}%` }}
              />
              <div className="absolute top-0 h-full w-[2px] bg-nearwhite/70" style={{ left: "51%" }} />
            </div>
            <div className="mt-2 flex w-[290px] justify-between font-mono text-[11px]">
              <span className="text-slash">assumes honest stake majority</span>
              <span className="text-muted-foreground">51%</span>
            </div>
          </div>

          {/* the coherence beam — a majority aligns; one dot is slashed */}
          <div className="absolute" style={{ left: 42, top: 236 }}>
            <div className="flex items-end gap-4">
              {[0, 1, 2, 3, 4].map((d) => {
                const align = tw(frame, 198 + d * 4, 218 + d * 4, 0, 1);
                const scatter = [26, -18, 34, -10, 18][d] ?? 0;
                return (
                  <div
                    key={d}
                    className="h-3.5 w-3.5 rounded-full bg-nearwhite"
                    style={{ marginBottom: scatter * (1 - align), opacity: tw(frame, 190 + d * 3, 196 + d * 3, 0, 1) }}
                  />
                );
              })}
              <div
                className="relative ml-6 h-3.5 w-3.5 rounded-full bg-slash/50"
                style={{ opacity: tw(frame, 214, 220, 0, 1), marginBottom: 14 }}
              >
                <div
                  className="absolute left-1/2 top-1/2 h-[20px] w-[1.5px] bg-slash"
                  style={{ translate: "-50% -50%", rotate: "45deg" }}
                />
              </div>
            </div>
            {/* the ruling the majority converges on */}
            <div
              className="mt-4 h-4 w-4 rotate-45 rounded-[2px] bg-amber"
              style={{ opacity: tw(frame, 220, 228, 0, 1), boxShadow: "0 0 12px var(--accord-amber)" }}
            />
            <div className="mt-2 font-mono text-[11px] text-muted-foreground" style={{ opacity: tw(frame, 224, 232, 0, 1) }}>
              coherent majority → Ruling
            </div>
          </div>
        </div>

        {/* legend */}
        <div className="absolute flex gap-5" style={{ left: 720, top: 596, translate: "-50% 0" }}>
          {[
            { tone: "confirm" as const, label: "verified on-chain" },
            { tone: "amber" as const, label: "trusted · attributed" },
            { tone: "slash" as const, label: "honest-majority assumption" },
          ].map((c, i) => (
            <div key={c.label} style={{ ...rise(frame, 18 + i * 3, 9), scale: String(legendBreath(i)) }}>
              <MonoChip tone={c.tone}>{c.label}</MonoChip>
            </div>
          ))}
        </div>
      </div>
    </ConceptScene>
  );
}
