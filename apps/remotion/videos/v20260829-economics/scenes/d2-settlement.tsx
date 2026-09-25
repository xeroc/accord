import type { FC } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { clamp, enterAt } from "../../../src/shell/anim";
import { EASE_EXPO } from "../../../src/shell/presets";
import { Scene } from "../../../src/shell/scene";
import { interpolate } from "remotion";
import { LedgerCounter, MonoChip, TokenBadge, VaultBox } from "@useaccord/ui";

import { AirlockDoor, ConceptChrome, EquationBox, TokenParticle } from "./pieces";
import { multiTick } from "./timeline";

/**
 * D2 · Coherence settlement — the slash is a ledger, not a transfer.
 * Load-bearing nuance: NO particle ever crosses the stake_vault for
 * the slash. Coherent/incoherent juror cards re-sort after `Final`;
 * fees itemize onto the coherent ledgers; then the slash fires as one
 * near-simultaneous cascade of row flashes and number deltas (staked
 * down on the incoherent side, up on the coherent side) while the
 * stake_vault does nothing but breathe under its "unchanged" badge.
 * The only particle in the scene is withdraw_fees — the one fee-token
 * exit door. The conservation strip re-seals with D1's equation
 * animation so the family reads as one system.
 */

/** Coherent J1–J4 (2x2, left), incoherent J5–J6 (right). */
const COHERENT: readonly { name: string; x: number; y: number; at: number }[] = [
  { name: "J1", x: 640, y: 352, at: 10 },
  { name: "J2", x: 810, y: 352, at: 12 },
  { name: "J3", x: 640, y: 488, at: 14 },
  { name: "J4", x: 810, y: 488, at: 16 },
];
const INCOHERENT: readonly { name: string; x: number; y: number; at: number }[] = [
  { name: "J5", x: 1010, y: 380, at: 18 },
  { name: "J6", x: 1010, y: 516, at: 20 },
];

/** Fee itemization chips arcing onto the coherent fees_earned rows. */
const FEE_CHIPS: readonly { label: string; at: number }[] = [
  { label: "participation +15", at: 40 },
  { label: "forfeited bonds +20", at: 54 },
  { label: "non-revealer +10", at: 68 },
];

const SLASH_AT = 100;
const TICK_FEES = [
  { at: 48, to: 15 },
  { at: 62, to: 35 },
  { at: 76, to: 45 },
];

/** JurorCard — a settlement seat with its mini-ledger. */
const JurorCard: FC<{
  frame: number;
  at: number;
  coherent: boolean;
  name: string;
  x: number;
  y: number;
  staked: { from: number; to: number; at: number };
  fees: { from: number; to: number; at: number };
}> = ({ frame, at, coherent, name, x, y, staked, fees }) => {
  const pop = interpolate(frame, [at, at + 10], [0, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const rise = interpolate(frame, [at, at + 10], [-14, 0], {
    easing: EASE_EXPO,
    ...clamp,
  });
  return (
    <div
      className="absolute w-[150px] rounded-lg border border-border-subtle bg-raised/70 px-2.5 py-2"
      style={{ left: x, top: y, translate: "-50% -50%", opacity: pop, transform: `translateY(${rise}px)` }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs text-text-secondary">{name}</span>
        <span className={`font-mono text-xs ${coherent ? "text-confirm" : "text-slash"}`}>
          {coherent ? "✓" : "✗"}
        </span>
      </div>
      <LedgerCounter
        frame={frame}
        label="staked"
        from={staked.from}
        to={staked.to}
        at={staked.at}
        tone={coherent ? "confirm" : "slash"}
      />
      <LedgerCounter
        frame={frame}
        label="fees_earned"
        from={fees.from}
        to={fees.to}
        at={fees.at}
        tone="amber"
      />
    </div>
  );
};

export function D2SettlementScene() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The stake_vault is untouched for the entire scene — its only life
  // is the breath and the "unchanged" badge (re-checked on the slash).
  const unchangedAt = frame >= 106 ? 106 : 52;
  const fee = multiTick(frame, 600, [{ at: 172, to: 555 }]);

  const stampChip = interpolate(frame, [2, 14], [1.04, 1], {
    easing: EASE_EXPO,
    ...clamp,
  });
  const arcIn = enterAt(frame, fps, 102 / fps, 8 / fps);

  return (
    <Scene seed="econ-d2">
      <ConceptChrome
        frame={frame}
        fps={fps}
        active={1}
        headline="settlement: the slash is a ledger entry"
        sub="incoherent stake ticks down, coherent ticks up — the vault never moves"
      />

      {/* header chip */}
      <MonoChip
        tone="amber"
        className="absolute px-6 py-2.5 text-sm"
        style={{
          left: 960,
          top: 200,
          translate: "-50% -50%",
          opacity: enterAt(frame, fps, 2 / fps, 10 / fps),
          transform: `scale(${stampChip})`,
        }}
      >
        after Final
      </MonoChip>

      {/* the two vaults — stillness is the message */}
      <div className="absolute" style={{ left: 200, top: 196 }}>
        <VaultBox
          frame={frame}
          label="stake_vault"
          token="stake"
          balance={600}
          at={4}
          unchangedAt={unchangedAt}
        />
      </div>
      <div className="absolute" style={{ left: 1470, top: 196 }}>
        <VaultBox
          frame={frame}
          label="fee_vault"
          token="fee"
          from={fee.from}
          balance={fee.to}
          tickAt={fee.at}
          at={6}
        />
      </div>

      {/* the panel, judged */}
      {COHERENT.map((j, i) => (
        <JurorCard
          key={j.name}
          frame={frame}
          at={j.at}
          coherent
          name={j.name}
          x={j.x}
          y={j.y}
          staked={multiTick(frame, 100, [{ at: SLASH_AT + i, to: 110 }])}
          fees={
            j.name === "J1"
              ? multiTick(frame, 0, [...TICK_FEES, { at: 166, to: 0 }])
              : multiTick(frame, 0, TICK_FEES)
          }
        />
      ))}
      {INCOHERENT.map((j, i) => (
        <JurorCard
          key={j.name}
          frame={frame}
          at={j.at}
          coherent={false}
          name={j.name}
          x={j.x}
          y={j.y}
          staked={multiTick(frame, 100, [{ at: SLASH_AT + i, to: 80 }])}
          fees={{ from: 0, to: 0, at: -999 }}
        />
      ))}

      {/* fees itemize onto the coherent ledgers (annotations, not transfers) */}
      {FEE_CHIPS.map((c) => {
        const t = interpolate(frame, [c.at, c.at + 8], [0, 1], {
          easing: EASE_EXPO,
          ...clamp,
        });
        // lands on the fees rows, then dissolves into the counter tick
        const fade = interpolate(frame, [c.at + 8, c.at + 14], [1, 0], clamp);
        const x = interpolate(frame, [c.at, c.at + 8], [930, 725], {
          easing: EASE_EXPO,
          ...clamp,
        });
        const y = interpolate(t, [0, 0.5, 1], [246, 216, 300], clamp);
        return (
          <MonoChip
            key={c.label}
            tone="amber"
            className="absolute"
            style={{ left: x, top: y, translate: "-50% -50%", opacity: fade }}
          >
            {c.label}
          </MonoChip>
        );
      })}

      {/* the slash annotation — explicitly NOT a transfer */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-nearwhite/35"
        viewBox="0 0 1920 1080"
      >
        <path
          d="M 1000 336 C 900 288, 800 288, 730 336"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="5 6"
          opacity={arcIn}
        />
      </svg>
      <MonoChip
        tone="slash"
        className="absolute"
        style={{
          left: 862,
          top: 268,
          translate: "-50% -50%",
          opacity: arcIn,
        }}
      >
        α·min_stake — ledger entry, not a transfer
      </MonoChip>

      {/* the only fee-token exit door */}
      <AirlockDoor
        frame={frame}
        at={8}
        openAt={148}
        height={90}
        label="withdraw_fees"
        style={{ left: 1600, top: 372 }}
      />
      {/* the wallet beyond the door */}
      <div
        className="absolute flex flex-col items-center gap-1 rounded-lg border border-border-subtle bg-raised/50 px-4 py-2"
        style={{ left: 1770, top: 420, translate: "-50% -50%", opacity: enterAt(frame, fps, 6 / fps, 10 / fps) }}
      >
        <span className="font-mono text-xs text-text-secondary">wallet</span>
        <TokenBadge frame={frame} tone="fee" amount={45} label="fee" at={156} />
      </div>
      {/* fee grains: fee_vault → door → wallet (never the stake vault) */}
      {[0, 1, 2].map((i) => (
        <TokenParticle
          key={`g1-${i}`}
          frame={frame}
          from={{ x: 1568, y: 330 }}
          to={{ x: 1600, y: 408 }}
          at={152 + i * 4}
          dur={8}
          tone="fee"
          peak={20}
        />
      ))}
      {[0, 1, 2].map((i) => (
        <TokenParticle
          key={`g2-${i}`}
          frame={frame}
          from={{ x: 1600, y: 420 }}
          to={{ x: 1745, y: 420 }}
          at={161 + i * 4}
          dur={8}
          tone="fee"
          peak={26}
        />
      ))}

      {/* conservation re-seal (echo of D1) */}
      <EquationBox
        frame={frame}
        fps={fps}
        at={196}
        countAt={210}
        sealAt={240}
        tone="stake"
        lhs={{ label: "stake_vault.balance", value: 600 }}
        rhs={{ label: "Σ JurorStake.staked", value: 600 }}
        style={{ position: "absolute", left: 960, top: 800, translate: "-50% -50%" }}
      />
    </Scene>
  );
}
