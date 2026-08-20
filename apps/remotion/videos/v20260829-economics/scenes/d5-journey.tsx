import type { FC } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt, exitAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { Scene } from "../../../src/shell/scene";
import { LedgerCounter, MerkleSumTree, StateNode, TokenBadge, VaultBox } from "@useaccord/ui";

import { AirlockDoor, ConceptChrome, Padlock, TokenParticle } from "./pieces";
import { multiTick } from "./timeline";

/**
 * D5 · The juror's capital journey — the airlock strip. Stake in
 * (wallet → accumulator leaf, root sum ticks), drawn (capital stack
 * + padlock, active_draws up, lane gate closed — and the refused
 * unstake nudge), disputes terminal (round chips stamp final, the
 * shackle lifts on the group's softest curve), request_withdraw
 * (leaf weight flips to zero, funds banked to pending_withdrawal
 * through the INNER door), withdraw (SPL out through the OUTER door).
 * The two doors are never open in the same beat — the airlock
 * invariant, visually enforced. A ghost padlock re-materializes for
 * the next juror.
 */

const STAKE = 110;
const LEAVES: readonly number[] = [120, 80, 0, 60, 200, 160, 90, 150];
const LEAF_I = 2;
const LEAF_PT = { x: 420, y: 505 }; // leaf 2 of 8 inside the MST box

/** Station captions — in/out windows trailing their station's event. */
const CAPTIONS: readonly { text: string; x: number; at: number; out?: number }[] = [
  { text: "capital committed while drawn", x: 660, at: 88, out: 110 },
  { text: "every drawn dispute terminal", x: 980, at: 132 },
  { text: "banked to pending_withdrawal", x: 1300, at: 152 },
  { text: "only withdraw mints SPL back", x: 1620, at: 218 },
];

/** The three rounds of the drawn dispute, each going terminal. */
const ROUNDS: readonly { id: string; at: number }[] = [
  { id: "R1", at: 114 },
  { id: "R2", at: 120 },
  { id: "R3", at: 126 },
];

/** StationRail — the five stations beneath the strip. */
const STATIONS: readonly { label: string; at: number; activeAt: number; settleAt: number; x: number }[] = [
  { label: "stake", at: 4, activeAt: 10, settleAt: 44, x: 340 },
  { label: "drawn", at: 40, activeAt: 56, settleAt: 84, x: 660 },
  { label: "terminal", at: 96, activeAt: 114, settleAt: 132, x: 980 },
  { label: "request_withdraw", at: 142, activeAt: 146, settleAt: 178, x: 1300 },
  { label: "withdraw", at: 180, activeAt: 190, settleAt: 214, x: 1620 },
];

/** VRF sparkle — deterministic jitter points popping around the leaf. */
const VrfSparkle: FC<{ frame: number; at: number }> = ({ frame, at }) => (
  <>
    {Array.from({ length: 6 }, (_, i) => {
      const a = at + i;
      const pop = interpolate(frame, [a, a + 2, a + 4], [0, 1, 0], clamp);
      const ang = random(`vrf:${i}:a`) * Math.PI * 2;
      const r = 18 + random(`vrf:${i}:r`) * 12;
      return (
        <div
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full bg-amber"
          style={{
            left: LEAF_PT.x + Math.cos(ang) * r,
            top: LEAF_PT.y + Math.sin(ang) * r * 0.6,
            translate: "-50% -50%",
            opacity: pop,
          }}
        />
      );
    })}
  </>
);

/** LaneGate — the drawn lane gate: wipes closed, flashes on refusal. */
const LaneGate: FC<{ frame: number; closeAt: number; flashAt: number; openAt: number }> = ({
  frame,
  closeAt,
  flashAt,
  openAt,
}) => {
  const close = interpolate(frame, [closeAt, closeAt + 7], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const reopen = interpolate(frame, [openAt, openAt + 7], [1, 0], clamp);
  const shut = Math.min(close, reopen);
  const flash = interpolate(frame, [flashAt, flashAt + 3, flashAt + 6], [0, 1, 0], clamp);
  return (
    <div
      className="absolute overflow-hidden rounded-full border border-border-subtle"
      style={{
        left: 590,
        top: 494,
        width: 140,
        height: 10,
        opacity: shut > 0.02 ? 1 : 0,
      }}
    >
      <div
        className={`h-full w-full ${flash > 0.05 ? "bg-slash/50" : "bg-nearwhite/20"}`}
        style={{ transform: `scaleX(${shut})`, transformOrigin: "center" }}
      />
    </div>
  );
};

export function D5JourneyScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const root = multiTick(frame, 860, [
    { at: 46, to: 970 },
    { at: 166, to: 860 },
  ]);
  const wallet = multiTick(frame, 1000, [
    { at: 18, to: 890 },
    { at: 216, to: 1000 },
  ]);
  const draws = multiTick(frame, 0, [
    { at: 80, to: 1 },
    { at: 130, to: 0 },
  ]);
  const pending = multiTick(frame, 0, [{ at: 168, to: STAKE }]);

  const capOp = (at: number, out?: number) =>
    enterAt(frame, fps, at / fps, 6 / fps) *
    (out !== undefined ? exitAt(frame, fps, (out - 6) / fps, 6 / fps) : 1);

  return (
    <Scene seed="econ-d5">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={4}
        headline="your capital: committed, not gone"
        sub="active_draws locks it · every drawn dispute terminal unlocks it · two doors, one SPL exit"
      />

      {/* station 1 — stake in: wallet + the accumulator */}
      <div
        className="absolute flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-raised/50 px-4 py-3"
        style={{ left: 250, top: 405, translate: "-50% -50%", opacity: enterAt(frame, fps, 2 / fps, 8 / fps) }}
      >
        <span className="font-mono text-xs text-text-secondary">wallet</span>
        <LedgerCounter frame={frame} label="SPL" from={wallet.from} to={wallet.to} at={wallet.at} tone="neutral" />
      </div>
      <div className="absolute" style={{ left: 320, top: 330 }}>
        <MerkleSumTree
          frame={frame}
          leaves={LEAVES}
          at={6}
          updateLeaf={LEAF_I}
          updateAt={22}
          updateTo={STAKE}
          hopDur={8}
          frostAt={22}
          zeroed={[LEAF_I]}
          zeroAt={154}
          rootLabel="accumulator · Σ root"
          width={320}
          height={230}
        />
      </div>
      <div className="absolute" style={{ left: 480, top: 582, translate: "-50% 0" }}>
        <LedgerCounter
          frame={frame}
          label="root sum"
          from={root.from}
          to={root.to}
          at={root.at}
          tone="amber"
        />
      </div>
      <VrfSparkle frame={frame} at={50} />

      {/* station 2 — drawn: capital stack, padlock, gate, counter */}
      <div
        className="absolute"
        style={{ left: 660, top: 340, translate: "-50% 0" }}
      >
        <LedgerCounter
          frame={frame}
          label="active_draws"
          from={draws.from}
          to={draws.to}
          at={draws.at}
          tone="amber"
        />
      </div>
      <div className="absolute" style={{ left: 660, top: 386, translate: "-50% -50%" }}>
        <Padlock frame={frame} at={62} openAt={134} fadeAt={150} />
      </div>
      <div className="absolute flex flex-col-reverse items-center gap-[3px]" style={{ left: 660, top: 415, translate: "-50% 0" }}>
        {Array.from({ length: 4 }, (_, i) => {
          const pop = enterAt(frame, fps, (58 + i * 2) / fps, 3 / fps);
          return (
            <div
              key={i}
              className="h-[12px] w-[26px] rounded-full border border-nearwhite/50 bg-nearwhite"
              style={{ opacity: pop, transform: `scaleY(${0.4 + pop * 0.6})` }}
            />
          );
        })}
      </div>
      <LaneGate frame={frame} closeAt={76} flashAt={92} openAt={138} />

      {/* the refused unstake — nudge, red flash, bounce back */}
      <TokenParticle frame={frame} from={{ x: 660, y: 445 }} to={{ x: 660, y: 488 }} at={90} dur={4} tone="stake" peak={0} />
      <TokenParticle frame={frame} from={{ x: 660, y: 490 }} to={{ x: 660, y: 452 }} at={95} dur={6} tone="stake" peak={0} />

      {/* station 3 — the drawn dispute's rounds go terminal */}
      {ROUNDS.map((r, i) => {
        const settled = frame >= r.at;
        const pop = interpolate(frame, [r.at - 4, r.at, r.at + 8], [1, 1.06, 1], {
          ...clamp,
        });
        return (
          <div
            key={r.id}
            className={`absolute flex w-[160px] items-center justify-between rounded-full border px-4 py-1.5 font-mono text-xs ${
              settled ? "border-confirm/50 bg-confirm/10 text-confirm" : "border-border-subtle bg-raised text-text-secondary"
            }`}
            style={{
              left: 980,
              top: 388 + i * 44,
              translate: "-50% -50%",
              opacity: enterAt(frame, fps, (50 + i * 3) / fps, 6 / fps),
              transform: `scale(${pop})`,
            }}
          >
            <span>{r.id}</span>
            <span className={settled ? "text-confirm" : "text-muted-foreground"}>
              {settled ? "final ✓" : "drawn"}
            </span>
          </div>
        );
      })}

      {/* station 5 — the wallet */}
      <div
        className="absolute flex flex-col items-center gap-2 rounded-lg border border-border-subtle bg-raised/50 px-4 py-3"
        style={{ left: 1640, top: 405, translate: "-50% -50%", opacity: enterAt(frame, fps, 2 / fps, 8 / fps) }}
      >
        <span className="font-mono text-xs text-text-secondary">wallet</span>
        <TokenBadge frame={frame} tone="stake" amount={STAKE} label="SPL" at={216} />
      </div>

      {/* the coin journeys */}
      {[0, 1, 2, 3].map((i) => (
        <TokenParticle
          key={`in-${i}`}
          frame={frame}
          from={{ x: 300, y: 400 }}
          to={{ x: LEAF_PT.x - 4, y: LEAF_PT.y - 12 }}
          at={10 + i * 2}
          dur={10}
          tone="stake"
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <TokenParticle
          key={`draw-${i}`}
          frame={frame}
          from={{ x: LEAF_PT.x, y: LEAF_PT.y - 18 }}
          to={{ x: 648, y: 448 }}
          at={56 + i * 2}
          dur={10}
          tone="stake"
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <TokenParticle
          key={`bank-${i}`}
          frame={frame}
          from={{ x: LEAF_PT.x + 8, y: LEAF_PT.y - 20 }}
          to={{ x: 1252, y: 408 }}
          at={156 + i * 2}
          dur={14}
          tone="stake"
        />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <TokenParticle
          key={`out-${i}`}
          frame={frame}
          from={{ x: 1408, y: 405 }}
          to={{ x: 1585, y: 400 }}
          at={194 + i * 2}
          dur={14}
          tone="stake"
        />
      ))}

      {/* station 4 — the inner door + pending_withdrawal */}
      <AirlockDoor frame={frame} at={8} openAt={146} closeAt={178} height={110} label="request_withdraw" style={{ left: 1140, top: 372 }} />
      <div className="absolute" style={{ left: 1280, top: 372 }}>
        <VaultBox
          frame={frame}
          label="pending_withdrawal"
          token="stake"
          from={pending.from}
          balance={pending.to}
          tickAt={pending.at}
          at={8}
        />
      </div>
      <AirlockDoor frame={frame} at={8} openAt={190} height={110} label="withdraw" style={{ left: 1545, top: 372 }} />
      {/* station captions */}
      {CAPTIONS.map((c) => (
        <p
          key={c.text}
          className="absolute font-mono text-sm text-text-secondary"
          style={{ left: c.x, top: 620, translate: "-50% 0", opacity: capOp(c.at, c.out) }}
        >
          {c.text}
        </p>
      ))}
      <p
        style={{ left: 660, top: 530, translate: "-50% 0", opacity: enterAt(frame, fps, 248 / fps, 6 / fps) }}
      >
        the next juror…
      </p>

      {/* the station rail */}
      {STATIONS.map((s) => (
        <div key={s.label} className="absolute" style={{ left: s.x, top: 742, translate: "-50% 0" }}>
          <StateNode
            frame={frame}
            label={s.label}
            at={s.at}
            activeAt={s.activeAt}
            settleAt={s.settleAt}
          />
        </div>
      ))}
    </Scene>
  );
}
